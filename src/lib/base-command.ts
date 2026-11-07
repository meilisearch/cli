/**
 * Every command extends BaseCommand. It parses the global flags, resolves the
 * output mode, resolves the credentials of the one API the command declares
 * with `static api` (ADR 0004), builds the client, and renders errors.
 * Commands never touch stdout, credentials or HTTP themselves.
 */
import { Command, Errors, Flags, type Interfaces } from "@oclif/core";
import type { EnqueuedTask, Meilisearch, Task } from "meilisearch";
import { flagNames, sendAnalytics, track } from "./analytics.js";
import { createManagementClient, type ManagementClient } from "./clients/management.js";
import { createMeilisearchClient } from "./clients/meilisearch.js";
import { installHttpTrace } from "./clients/trace.js";
import {
  type ConfigFile,
  configFilePath,
  ENV,
  type Env,
  nonEmpty,
  outputOptions,
  readConfigFile,
  resolveCloudProjectId,
  resolveProjectConnection,
} from "./config.js";
import {
  EXIT_CODES,
  MeiliCliError,
  toRenderedError,
  writeError,
  writeNotice,
  writeWarning,
} from "./errors.js";
import { defaultView, itemView, taskOutcome } from "./human.js";
import { readStdin } from "./input.js";
import {
  type HumanView,
  outputMode,
  paint,
  setOutputMode,
  writeData,
  writeView,
} from "./output.js";
import {
  iteratePages,
  type ListPage,
  mergePages,
  nextOffsetQuery,
  type OffsetQuery,
} from "./pagination.js";
import {
  credentialsFilePath,
  readCredentialsFile,
  resolveManagementCredentials,
  type Session,
} from "./session.js";
import { DEFAULT_TIMEOUT, isTaskFailure, parseDuration, waitForTask } from "./tasks.js";
import { isPromptExit } from "./terminal.js";

/** The API a command talks to. `none` commands work offline. */
export type Api = "meilisearch" | "management" | "none";

/** The statics every command declares beyond oclif's, as the manifest carries them. */
export type LoadableCommand = Command.Loadable & {
  api: Api;
  routes: readonly string[];
  keyActions: readonly string[];
};

export type GlobalFlags = Interfaces.InferredFlags<
  typeof BaseCommand.baseFlags &
    typeof BaseCommand.connectionFlags &
    typeof BaseCommand.cloudProjectFlags &
    typeof BaseCommand.syncWithCloudFlags
>;

/** `--limit`, which a list route declares whichever way it pages, shared by both groups below. */
const LIMIT_FLAG = Flags.integer({ description: "Passed to the API.", helpValue: "<n>" });

export interface WaitFlagValues {
  wait?: boolean | undefined;
  timeout?: string | undefined;
}

/** What a write command tells a human about its task, around the task itself. */
export interface TaskSentences {
  /** What the task will do, once enqueued: "Task 1532 will add them to index movies." */
  enqueued: (taskUid: number) => string;
  /** What is true until the task succeeds, before the command that follows it. */
  pending: string;
  /** What the task did, after "Task 1532 succeeded: ". Without it, the sentence ends at "succeeded". */
  succeeded?: (task: Task) => string;
}

/** What a write command without sentences of its own tells a human about its task. */
const TASK_SENTENCES: TaskSentences = {
  enqueued: (taskUid) => `Task ${taskUid} is enqueued.`,
  pending: "It is not done yet. Follow it:",
};

export abstract class BaseCommand extends Command {
  /** Which API this command uses. Every command sets it. */
  static api: Api = "none";

  /**
   * The routes an API command covers, `METHOD /path` as written in the OpenAPI
   * document: every route of its resource and verb. The command name and flags
   * derive from them (docs/contract/commands.md, "Naming rules"), and when there
   * are several, the flags given select the route. Commands with `api = "none"`
   * leave it empty.
   */
  static routes: readonly string[] = [];

  /**
   * The Meilisearch key actions the routes require, the specific one of each,
   * `["indexes.get"]`, as the `security` of the OpenAPI document declares it.
   * `meili schema --command` prints them so that a 403 names what the key
   * lacks. Empty when no key action is required (`GET /health`), and on the
   * Management API, whose document declares no key action.
   */
  static keyActions: readonly string[] = [];

  /** Compact JSON whatever stdout is: a command whose output is for programs, `schema` (ADR 0023). */
  static alwaysJson = false;

  /** The global flags of docs/contract/commands.md, in the same order: on every command. */
  static override baseFlags = {
    json: Flags.boolean({
      description: "Print compact JSON. The default when stdout is not a terminal.",
      helpGroup: "OUTPUT",
    }),
    "no-color": Flags.boolean({
      description: "Print without colors. NO_COLOR does the same.",
      helpGroup: "OUTPUT",
    }),
    debug: Flags.boolean({
      description: "Print every HTTP request and response on stderr, secrets redacted.",
    }),
  };

  /**
   * How a command reaches a Meilisearch project, the group of
   * docs/contract/commands.md. Spread by the commands that talk to one, and by
   * no other: `auth`, `schema` and the `config` commands resolve no project, so
   * they offer no way to name one. In the command's own flags rather than in
   * `baseFlags`, so that `meili schema --command` shows them.
   */
  static connectionFlags = {
    "project-url": Flags.string({
      description:
        "Project URL, the Meilisearch instance to talk to. One of --project or --project-url is required.",
      helpValue: "<url>",
    }),
    "project-api-key": Flags.string({
      description: "Project API key. `-` reads it from stdin.",
      helpValue: "<key>",
      parse: async (value) => (value === "-" ? readStdin() : value),
    }),
    project: Flags.string({
      char: "p",
      description:
        "A project of the config file. Cannot be combined with --project-url. One of --project or --project-url is required.",
      helpValue: "<name>",
    }),
  };

  /**
   * The Cloud project a management command acts on, when it acts on one:
   * `--project` names an entry of the config file for its `cloud.id` here,
   * rather than for its URL and key (ADR 0011). Spread next to `--id`.
   */
  static cloudProjectFlags = {
    project: Flags.string({
      char: "p",
      description:
        "A project of the config file, whose cloud.id names the Cloud project, in place of --id.",
      helpValue: "<name>",
    }),
  };

  /**
   * `config set` and `config update` work offline, and talk to the Management
   * API only with `--sync-with-cloud` (ADR 0011).
   */
  static syncWithCloudFlags = {
    "sync-with-cloud": Flags.boolean({
      description:
        "Write the entry's cloud identifiers from Meilisearch Cloud, and its master key when the entry has no key. Never replaces a key.",
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
    limit: LIMIT_FLAG,
    offset: Flags.integer({ description: "Passed to the API.", helpValue: "<n>" }),
    all: Flags.boolean({ description: "Fetch every page, and print them as one list." }),
  };

  /**
   * The same group for a route that pages with a cursor rather than an offset:
   * tasks and batches take `from` and answer `next`. One group per cursor name,
   * because the contract names the flag after the parameter of its route.
   * No `--all`: an instance can hold millions of tasks and batches.
   */
  static fromPaginationFlags = {
    limit: LIMIT_FLAG,
    from: Flags.integer({
      description: "Passed to the API: the uid the page starts at, going down.",
      helpValue: "<uid>",
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
  /** Set when `static api` is `meilisearch`. */
  protected meilisearch!: Meilisearch;
  /** Set when `static api` is `management`. Passed to the generated SDK functions, which throw contract errors. */
  protected managementClient!: ManagementClient;

  /** The process environment, the one place `src/` reads it from outside `config.ts`. */
  protected get env(): Env {
    return process.env;
  }

  protected get api(): Api {
    return (this.constructor as typeof BaseCommand).api;
  }

  override async init(): Promise<void> {
    // Before the flags are parsed, so that a usage error is written in the right format.
    const options = outputOptions(this.argv, this.env);
    setOutputMode(
      (this.constructor as typeof BaseCommand).alwaysJson ? { ...options, json: true } : options,
    );
    await super.init();
    const { flags } = await this.parse({
      flags: this.ctor.flags,
      baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
      args: this.ctor.args,
      strict: this.ctor.strict,
    });
    this.globalFlags = flags as GlobalFlags;
    // Before any client: `auth login` talks to the authorization server with no client at all.
    if (this.globalFlags.debug) installHttpTrace();

    const api = this.globalFlags["sync-with-cloud"] === true ? "management" : this.api;
    if (api === "none") return;

    if (api === "meilisearch") {
      const connection = resolveProjectConnection(
        {
          url: this.globalFlags["project-url"],
          apiKey: this.globalFlags["project-api-key"],
          project: this.globalFlags.project,
        },
        () => this.configFile(),
      );
      this.meilisearch = this.meilisearchClient(connection.url, connection.apiKey);
      return;
    }

    await this.connectManagement();
  }

  /**
   * A client for one Meilisearch instance. `init` builds the one of the
   * connection flags; `teleport` builds the ones of the projects it is told.
   */
  protected meilisearchClient(url: string, apiKey: string | undefined): Meilisearch {
    return createMeilisearchClient({ url, apiKey, userAgent: this.userAgent });
  }

  /**
   * Resolves the Management API credentials and sets `managementClient`. `init`
   * calls it for a management command; `teleport` calls it after its login.
   */
  protected async connectManagement(): Promise<void> {
    const credentials = await resolveManagementCredentials(this.env, writeWarning);
    this.managementClient = createManagementClient({
      ...credentials,
      userAgent: this.userAgent,
    });
  }

  /** What both APIs see in their client header: `meili-cli (v1.2.3)`. */
  protected get userAgent(): string {
    return `meili-cli (v${this.config.version})`;
  }

  private readonly startedAt = performance.now();
  /** The code the command exits with, kept for its `cli_command_run` event. */
  private exitCode = 0;

  override exit(code = 0): never {
    this.exitCode = code;
    return super.exit(code);
  }

  /** Sends the usage events of the run, after its output and its error (ADR 0016). */
  override async finally(error: Error | undefined): Promise<void> {
    await this.sendUsage(error);
    await super.finally(error);
  }

  /** Exits from a signal handler, where `finally` never runs, once the usage events are sent. */
  protected async exitNow(code: number): Promise<never> {
    this.exitCode = code;
    await this.sendUsage(undefined);
    return process.exit(code);
  }

  private async sendUsage(error: Error | undefined): Promise<void> {
    const failed =
      error !== undefined && !(error instanceof Errors.ExitError) && !isPromptExit(error);
    track("cli_command_run", {
      flags: flagNames(this.argv, { ...this.ctor.baseFlags, ...this.ctor.flags }),
      exit_code: this.exitCode,
      error_code: failed ? toRenderedError(error).body.code : undefined,
      duration_ms: Math.round(performance.now() - this.startedAt),
    });
    await sendAnalytics(this.env, {
      command: this.id?.replaceAll(":", " "),
      cli_version: this.config.version,
    });
  }

  /** An error the human already read, before the data it is about: it is not written again. */
  private shownError: MeiliCliError | undefined;

  /** Renders every error as the contract says, then exits with its code. */
  protected override async catch(error: unknown): Promise<never> {
    if (error instanceof Errors.ExitError) throw error;
    const rendered = toRenderedError(
      error,
      [],
      nonEmpty(this.env[ENV.MANAGEMENT_TOKEN]) !== undefined,
    );
    if (error !== this.shownError) {
      writeError(rendered, { debug: this.globalFlags?.debug ?? this.argv.includes("--debug") });
    }
    this.exit(rendered.exitCode);
  }

  /** The Cloud project a management command acts on: `--id`, or the `cloud.id` of the entry `--project` names. */
  protected cloudProjectId(id: number | undefined): number {
    return resolveCloudProjectId({ id, project: this.globalFlags.project }, () =>
      this.configFile(),
    );
  }

  /** The config file of docs/contract/config.md, empty when it does not exist. */
  protected configFile(): ConfigFile {
    return readConfigFile(configFilePath(this.env), writeWarning);
  }

  /** The credentials file of `auth login`, and the session in it when there is one. */
  protected credentialsFile(): { path: string; session: Session | undefined } {
    const path = credentialsFilePath(this.env);
    return { path, session: readCredentialsFile(path, writeWarning) };
  }

  /**
   * Writes the API response as it is, or for a human in a terminal the text
   * `view` makes of it, a table or every attribute by default. Read commands
   * end with this call.
   */
  protected async output<T>(data: T, view: (data: T) => HumanView = defaultView): Promise<void> {
    if (outputMode().human) writeView(view(data));
    else writeData(data);
  }

  /** Lines for a human on stderr, such as what a command did beyond its data. Nothing without a human. */
  protected say(...lines: string[]): void {
    if (outputMode().human) writeView({ status: lines });
  }

  /**
   * Writes one page as the API sent it, or every page with `--all`, merged into
   * one envelope. List routes end with this call. `fetchPage` is one API call,
   * returning the API body as it is. `view` is the text for a human, as in `output`.
   */
  protected async outputList(
    fetchPage: (query: OffsetQuery) => Promise<ListPage>,
    query: OffsetQuery,
    all: boolean,
    view?: (page: ListPage) => HumanView,
  ): Promise<void> {
    if (!all) {
      await this.output(await fetchPage(query), view);
      return;
    }
    const pages: ListPage[] = [];
    for await (const page of iteratePages(fetchPage, query, nextOffsetQuery)) pages.push(page);
    await this.output(mergePages(pages), view);
  }

  /**
   * The `--wait` of `what`: `poll` polls it until its final status. On stderr,
   * one line each time the status changes, with the time spent, and a blank
   * line once it is over. Ctrl-C exits 130, and tells a human that `what` goes
   * on, then `interrupted`: what the command did not do, and how to follow it.
   */
  protected async watch<T>(
    what: string,
    interrupted: { status?: string[]; next: string[] },
    poll: (onProgress: (current: { status: string }) => void) => Promise<T>,
  ): Promise<T> {
    const startedAt = performance.now();
    let last: string | undefined;
    let exiting: Promise<never> | undefined;
    const onInterrupt = () => {
      if (outputMode().human) {
        writeView({
          status: [
            "",
            `${paint("yellow", "◐")} ${what} is still in progress. meili CLI stopped watching it.`,
            ...(interrupted.status ?? []),
          ],
          next: interrupted.next,
        });
      }
      exiting = this.exitNow(EXIT_CODES.interrupted);
    };
    process.once("SIGINT", onInterrupt);
    let final: T;
    try {
      final = await poll(({ status }) => {
        if (status === last) return;
        last = status;
        const seconds = Math.round((performance.now() - startedAt) / 1000);
        writeNotice(
          `${paint("yellow", "◐")} ${what} is ${status.replaceAll("_", " ")} (${seconds}s)`,
        );
      });
    } finally {
      process.removeListener("SIGINT", onInterrupt);
      // Ctrl-C during the last poll: the command never goes on with its result or its error.
      if (exiting !== undefined) {
        await exiting;
        this.exit(EXIT_CODES.interrupted);
      }
    }
    if (last !== undefined) writeNotice("");
    return final;
  }

  /** The `--timeout` of `--wait`, or `MEILI_TIMEOUT`, or the default, in milliseconds. */
  protected waitTimeoutMs(flags: WaitFlagValues): number {
    return parseDuration(flags.timeout ?? this.env[ENV.TIMEOUT] ?? DEFAULT_TIMEOUT);
  }

  /**
   * Writes the task the API returned, or with `--wait` the final task. Exits 7
   * through `cli_task_failed` when the task failed or was canceled. Write
   * commands end with this call. A human reads what the task does, in the
   * command's `sentences` or in generic ones, and a failure before the task.
   */
  protected async outputTask(
    task: EnqueuedTask,
    flags: WaitFlagValues,
    sentences = TASK_SENTENCES,
  ): Promise<void> {
    if (flags.wait !== true) {
      await this.output(task, () => ({
        ...itemView([`${paint("yellow", "◐")} ${sentences.enqueued(task.taskUid)}`], task),
        next: [
          `${paint("dim", sentences.pending)} meili task view --id ${task.taskUid}`,
          `${paint("dim", "Next time, wait for the end with")} --wait${paint("dim", ".")}`,
        ],
      }));
      return;
    }
    const timeoutMs = this.waitTimeoutMs(flags);
    const finalTask = await this.watch(
      `Task ${task.taskUid}`,
      { next: [`${paint("dim", "Follow it:")} meili task view --id ${task.taskUid}`] },
      (onProgress) => waitForTask(this.meilisearch, task.taskUid, { timeoutMs, onProgress }),
    );
    await this.output(finalTask, () =>
      itemView(taskOutcome(finalTask, sentences.succeeded), finalTask),
    );
    if (isTaskFailure(finalTask)) {
      const error = new MeiliCliError(
        "cli_task_failed",
        `Task ${finalTask.uid} finished with status ${finalTask.status}.`,
        { hint: `Run \`meili task view --id ${finalTask.uid}\` to see the error details.` },
      );
      if (outputMode().human) this.shownError = error;
      throw error;
    }
  }
}
