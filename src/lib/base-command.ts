/**
 * Every command extends BaseCommand. It parses the global flags, resolves the
 * output mode, resolves the credentials of the one API the command declares
 * with `static api` (ADR 0004), builds the client, and renders errors.
 * Commands never touch stdout, credentials or HTTP themselves.
 */
import { Command, Errors, Flags, type Interfaces } from "@oclif/core";
import type { EnqueuedTask, Meilisearch } from "meilisearch";
import { createMeilisearchClient } from "./clients/meilisearch.js";
import {
  type ConfigFile,
  configFilePath,
  ENV,
  type ManagementCredentials,
  readConfigFile,
  resolveManagementCredentials,
  resolveProjectConnection,
} from "./config.js";
import { MeiliCliError, toRenderedError, writeError, writeWarning } from "./errors.js";
import { readStdin } from "./input.js";
import { type OutputMode, resolveOutputMode, writeData } from "./output.js";
import { iteratePages, type ListPage, mergePages, type OffsetQuery } from "./pagination.js";
import { DEFAULT_TIMEOUT, isTaskFailure, parseDuration, waitForTask } from "./tasks.js";

/** The API a command talks to. `none` commands work offline. */
export type Api = "meilisearch" | "management" | "none";

export type GlobalFlags = Interfaces.InferredFlags<typeof BaseCommand.baseFlags>;

export interface WaitFlagValues {
  wait?: boolean | undefined;
  timeout?: string | undefined;
}

export abstract class BaseCommand extends Command {
  /** Which API this command uses. Every command sets it. */
  static api: Api = "none";

  /**
   * The routes an API command covers, `METHOD /path` as written in the OpenAPI
   * document: every route of its verb and resource. The command name and flags
   * derive from them (docs/contract/commands.md, "Naming rules"), and the flags
   * given select the route. Commands with `api = "none"` leave it empty.
   */
  static routes: readonly string[] = [];

  /** The global flags of docs/contract/commands.md, in the same order. */
  static override baseFlags = {
    "project-url": Flags.string({
      description: "Project URL, the Meilisearch instance to talk to.",
      helpValue: "<url>",
    }),
    "project-api-key": Flags.string({
      description: "Project API key. `-` reads it from stdin.",
      helpValue: "<key>",
      parse: async (value) => (value === "-" ? readStdin() : value),
    }),
    project: Flags.string({
      description:
        "A project of the config file. Cannot be combined with --project-url. Required when the file has several projects.",
      helpValue: "<name>",
    }),
    output: Flags.option({
      char: "o",
      options: ["json", "ndjson"] as const,
      description:
        "json (default): one document, the API body as it is, indented in a terminal, compact when piped. ndjson: one item per line, list commands only, streams with --all.",
      helpValue: "<mode>",
    })(),
    debug: Flags.boolean({
      description: "Print every HTTP request and response on stderr, secrets redacted.",
    }),
  };

  /** Shared group for write commands whose API response is a task. */
  static waitFlags = {
    wait: Flags.boolean({
      description: "Poll the task until it reaches a final status, then print the final task.",
    }),
    timeout: Flags.string({
      description: `Maximum wait time, for example 30s, 2m. Default ${DEFAULT_TIMEOUT}. Only with --wait.`,
      helpValue: "<duration>",
      dependsOn: ["wait"],
    }),
  };

  /** Shared group for list commands. */
  static paginationFlags = {
    limit: Flags.integer({ description: "Passed to the API.", helpValue: "<n>" }),
    offset: Flags.integer({ description: "Passed to the API.", helpValue: "<n>" }),
    all: Flags.boolean({
      description: "Fetch every page. Streams with ndjson, buffers into one array with json.",
    }),
  };

  /** Shared group for commands that send a JSON body. */
  static bodyInputFlags = {
    file: Flags.string({
      description: "Read the body from a file. `-` reads from stdin.",
      helpValue: "<path>",
      exclusive: ["data"],
    }),
    data: Flags.string({ description: "Inline JSON body.", helpValue: "<json>" }),
  };

  /** Shared group for the commands of the verb `delete`, which refuse to run without it (ADR 0007). */
  static confirmFlags = {
    yes: Flags.boolean({
      required: true,
      description: "Confirm the deletion. Nothing is sent to the API without it.",
    }),
  };

  protected globalFlags!: GlobalFlags;
  protected outputMode!: OutputMode;
  /** Set when `static api` is `meilisearch`. */
  protected meilisearch!: Meilisearch;
  /** Set when `static api` is `management`. The client is built here once it is generated. */
  protected management: ManagementCredentials | undefined;

  protected get api(): Api {
    return (this.constructor as typeof BaseCommand).api;
  }

  override async init(): Promise<void> {
    await super.init();
    const { flags } = await this.parse({
      flags: this.ctor.flags,
      baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
      args: this.ctor.args,
      strict: this.ctor.strict,
    });
    this.globalFlags = flags as GlobalFlags;
    this.outputMode = resolveOutputMode({ flag: this.globalFlags.output, env: process.env });

    if (this.api === "none") return;

    if (this.api === "meilisearch") {
      const connection = resolveProjectConnection(
        {
          url: this.globalFlags["project-url"],
          apiKey: this.globalFlags["project-api-key"],
          project: this.globalFlags.project,
        },
        process.env,
        () => this.configFile(),
      );
      this.meilisearch = createMeilisearchClient({
        url: connection.url,
        apiKey: connection.apiKey,
        debug: this.globalFlags.debug,
        version: this.config.version,
      });
      return;
    }

    this.management = resolveManagementCredentials(process.env);
  }

  /** Renders every error as the contract says, then exits with its code. */
  protected override async catch(error: unknown): Promise<never> {
    if (error instanceof Errors.ExitError) throw error;
    const rendered = toRenderedError(error);
    writeError(rendered, {
      pretty: process.stderr.isTTY === true,
      debug: this.globalFlags?.debug ?? this.argv.includes("--debug"),
    });
    this.exit(rendered.exitCode);
  }

  /** The config file of docs/contract/config.md, empty when it does not exist. */
  protected configFile(): ConfigFile {
    return readConfigFile(configFilePath(process.env), writeWarning);
  }

  /** Writes the API response as it is. Read commands end with this call. */
  protected async output(data: unknown, options: { supportsNdjson?: boolean } = {}): Promise<void> {
    writeData(data, {
      mode: this.outputMode,
      stdoutIsTTY: process.stdout.isTTY === true,
      supportsNdjson: options.supportsNdjson ?? false,
    });
  }

  /**
   * Writes one page, or every page with `--all`. `json` prints the envelope,
   * `ndjson` one item per line, streamed with `--all`. List routes end with
   * this call. `fetchPage` is one API call, returning the API body as it is.
   */
  protected async outputList(
    fetchPage: (query: OffsetQuery) => Promise<ListPage>,
    query: OffsetQuery,
    all: boolean,
  ): Promise<void> {
    if (!all) {
      const page = await fetchPage(query);
      await this.output(this.outputMode === "ndjson" ? page.results : page, {
        supportsNdjson: true,
      });
      return;
    }
    if (this.outputMode === "ndjson") {
      for await (const page of iteratePages(fetchPage, query)) {
        await this.output(page.results, { supportsNdjson: true });
      }
      return;
    }
    const pages: ListPage[] = [];
    for await (const page of iteratePages(fetchPage, query)) pages.push(page);
    await this.output(mergePages(pages));
  }

  /**
   * Writes the task the API returned, or with `--wait` the final task. Exits 7
   * through `cli_task_failed` when the task failed or was canceled. Write
   * commands end with this call.
   */
  protected async outputTask(task: EnqueuedTask, flags: WaitFlagValues): Promise<void> {
    if (flags.wait !== true) {
      await this.output(task);
      return;
    }
    const timeoutMs = parseDuration(flags.timeout ?? process.env[ENV.TIMEOUT] ?? DEFAULT_TIMEOUT);
    const finalTask = await waitForTask(this.meilisearch, task.taskUid, {
      timeoutMs,
      onProgress: (current) => {
        if (process.stderr.isTTY === true) {
          process.stderr.write(`waiting for task ${current.uid}, status ${current.status}\n`);
        }
      },
    });
    await this.output(finalTask);
    if (isTaskFailure(finalTask)) {
      throw new MeiliCliError(
        "cli_task_failed",
        `Task ${finalTask.uid} finished with status ${finalTask.status}.`,
        { hint: `Run \`meili get tasks --ids ${finalTask.uid}\` to see the error details.` },
      );
    }
  }
}
