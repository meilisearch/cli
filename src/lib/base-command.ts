/**
 * Every command extends BaseCommand. It parses the global flags, resolves the
 * output mode, resolves the credentials of the one API the command declares
 * with `static api` (ADR 0004), builds the client, and renders errors.
 * Commands never touch stdout, credentials or HTTP themselves.
 */
import { join } from "node:path";
import { Command, Errors, Flags, type Interfaces } from "@oclif/core";
import type { EnqueuedTask, Meilisearch } from "meilisearch";
import { createEngineClient } from "./clients/engine.js";
import {
  CONFIG_FILE_NAME,
  type ConfigFile,
  ENV,
  type ManagementCredentials,
  readConfigFile,
  resolveConfigDir,
  resolveEngineConnection,
  resolveManagementCredentials,
} from "./config.js";
import { MeiliCliError, toRenderedError, writeError } from "./errors.js";
import {
  type OutputMode,
  resolveOutputMode,
  resolveOutputModeFromArgv,
  useColor,
  writeData,
} from "./output.js";
import { DEFAULT_TIMEOUT, isTaskFailure, parseDuration, waitForTask } from "./tasks.js";

/** The API a command talks to. `none` commands work offline. */
export type Api = "engine" | "management" | "none";

export type GlobalFlags = Interfaces.InferredFlags<typeof BaseCommand.baseFlags>;

export interface WaitFlagValues {
  wait?: boolean | undefined;
  timeout?: string | undefined;
}

export abstract class BaseCommand extends Command {
  /** Which API this command uses. Every command sets it. */
  static api: Api = "none";

  /** The global flags of docs/contract/commands.md, in the same order. */
  static override baseFlags = {
    context: Flags.string({
      description: "Use a named context from the config file.",
      helpValue: "<name>",
    }),
    url: Flags.string({ description: "Engine URL. Overrides the context.", helpValue: "<url>" }),
    "api-key": Flags.string({
      description: "Engine API key. Overrides the context.",
      helpValue: "<key>",
    }),
    output: Flags.option({
      char: "o",
      options: ["json", "ndjson", "table"] as const,
      description: "Output mode. Default: json when stdout is not a TTY, table when it is.",
      helpValue: "<mode>",
    })(),
    json: Flags.boolean({ description: "Same as --output json.", exclusive: ["output"] }),
    yes: Flags.boolean({
      char: "y",
      description:
        "Skip the confirmation of destructive commands. Required when stdin is not a TTY.",
    }),
    debug: Flags.boolean({
      description: "Print every HTTP request and response on stderr, secrets redacted.",
    }),
    "no-color": Flags.boolean({
      description: "Disable colors. Also honored through the NO_COLOR environment variable.",
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

  /**
   * Shared group for list commands. The cursor flag is the API parameter name of
   * the route: `offset` for most routes, `from` for tasks and batches.
   */
  static paginationFlags(cursor: "offset" | "from") {
    return {
      limit: Flags.integer({ description: "Passed to the API.", helpValue: "<n>" }),
      [cursor]: Flags.integer({
        description: "Passed to the API.",
        helpValue: cursor === "from" ? "<uid>" : "<n>",
      }),
      all: Flags.boolean({
        description: "Fetch every page. Streams with ndjson, buffers into one array with json.",
      }),
    };
  }

  /** Shared group for commands that send a JSON body. */
  static bodyInputFlags = {
    file: Flags.string({
      description: "Read the body from a file. `-` reads from stdin.",
      helpValue: "<path>",
      exclusive: ["data"],
    }),
    data: Flags.string({ description: "Inline JSON body.", helpValue: "<json>" }),
  };

  protected globalFlags!: GlobalFlags;
  protected outputMode!: OutputMode;
  protected color!: boolean;
  /** Set when `static api` is `engine`. */
  protected engine!: Meilisearch;
  /** Set when `static api` is `management`. The client is built here once it is generated. */
  protected management: ManagementCredentials | undefined;
  protected configFile: ConfigFile | undefined;
  protected configFilePath: string | undefined;

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
    const stdoutIsTTY = process.stdout.isTTY === true;
    this.outputMode = resolveOutputMode({
      flag: this.globalFlags.output,
      json: this.globalFlags.json,
      env: process.env,
      stdoutIsTTY,
    });
    this.color = useColor({
      streamIsTTY: stdoutIsTTY,
      noColorFlag: this.globalFlags["no-color"],
      env: process.env,
    });

    if (this.api === "none") return;

    const configDir = resolveConfigDir({ env: process.env, oclifConfigDir: this.config.configDir });
    this.configFilePath = configDir === undefined ? undefined : join(configDir, CONFIG_FILE_NAME);
    this.configFile =
      this.configFilePath === undefined ? undefined : readConfigFile(this.configFilePath);

    if (this.api === "engine") {
      const connection = resolveEngineConnection({
        flags: {
          url: this.globalFlags.url,
          apiKey: this.globalFlags["api-key"],
          context: this.globalFlags.context,
        },
        env: process.env,
        file: this.configFile,
        filePath: this.configFilePath,
      });
      this.engine = createEngineClient({
        url: connection.url,
        apiKey: connection.apiKey,
        debug: this.globalFlags.debug,
        version: this.config.version,
      });
      return;
    }

    this.management = resolveManagementCredentials({
      flags: {},
      env: process.env,
      file: this.configFile,
    });
  }

  /** Renders every error as the contract says, then exits with its code. */
  protected override async catch(error: unknown): Promise<never> {
    if (error instanceof Errors.ExitError) throw error;
    const rendered = toRenderedError(error);
    const mode =
      this.outputMode ??
      resolveOutputModeFromArgv(this.argv, process.env, process.stdout.isTTY === true);
    writeError(rendered, {
      mode,
      pretty: process.stderr.isTTY === true,
      debug: this.globalFlags?.debug ?? this.argv.includes("--debug"),
    });
    this.exit(rendered.exitCode);
  }

  /** Writes the API response as it is. Read commands end with this call. */
  protected async output(data: unknown, options: { supportsNdjson?: boolean } = {}): Promise<void> {
    writeData(data, {
      mode: this.outputMode,
      stdoutIsTTY: process.stdout.isTTY === true,
      supportsNdjson: options.supportsNdjson ?? false,
      color: this.color,
    });
  }

  /**
   * Writes the task the API returned, or with `--wait` the final task. Exits 8
   * through `cli_task_failed` when the task failed or was canceled. Write
   * commands end with this call.
   */
  protected async outputTask(task: EnqueuedTask, flags: WaitFlagValues): Promise<void> {
    if (flags.wait !== true) {
      await this.output(task);
      return;
    }
    const timeoutMs = parseDuration(flags.timeout ?? process.env[ENV.TIMEOUT] ?? DEFAULT_TIMEOUT);
    const finalTask = await waitForTask(this.engine, task.taskUid, {
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
        { hint: `Run \`meili task get ${finalTask.uid}\` to see the error details.` },
      );
    }
  }
}
