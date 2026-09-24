/**
 * Error contract: codes, exit codes and rendering. See docs/contract/output.md.
 *
 * This file, output.ts and config.ts implement the contract. They change only
 * through a contract pull request.
 */
import { Errors } from "@oclif/core";
import {
  MeilisearchApiError,
  MeilisearchRequestError,
  MeilisearchRequestTimeOutError,
} from "meilisearch";
import { type OutputMode, resolveOutputModeFromArgv } from "./output.js";

/** Exit codes, as listed in the table of docs/contract/output.md. */
export const EXIT_CODES = {
  success: 0,
  error: 1,
  usage: 2,
  auth: 3,
  notFound: 4,
  timeout: 5,
  network: 6,
  confirmationRequired: 7,
  taskFailed: 8,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/** Codes of errors raised by the CLI itself, with their default exit code. */
export const CLI_ERROR_CODES = {
  cli_usage: EXIT_CODES.usage,
  cli_config: EXIT_CODES.usage,
  cli_auth_missing: EXIT_CODES.auth,
  cli_confirmation_required: EXIT_CODES.confirmationRequired,
  cli_timeout: EXIT_CODES.timeout,
  cli_network: EXIT_CODES.network,
  cli_task_failed: EXIT_CODES.taskFailed,
  cli_input_invalid: EXIT_CODES.usage,
  cli_internal: EXIT_CODES.error,
} as const;

export type CliErrorCode = keyof typeof CLI_ERROR_CODES;

/**
 * Codes the CLI builds for management API errors, which have no error body in
 * the OpenAPI spec. Keyed by code, valued by exit code.
 */
export const MANAGEMENT_ERROR_CODES = {
  management_unauthorized: EXIT_CODES.auth,
  management_forbidden: EXIT_CODES.auth,
  management_not_found: EXIT_CODES.notFound,
  management_unprocessable: EXIT_CODES.error,
  management_error: EXIT_CODES.error,
} as const;

export type ManagementErrorCode = keyof typeof MANAGEMENT_ERROR_CODES;

/** Maps an HTTP status of the management API to its CLI error code. */
export function managementErrorCode(status: number): ManagementErrorCode {
  switch (status) {
    case 401:
      return "management_unauthorized";
    case 403:
      return "management_forbidden";
    case 404:
      return "management_not_found";
    case 422:
      return "management_unprocessable";
    default:
      return "management_error";
  }
}

/** Exit code of an engine API error, from its HTTP status. */
export function engineExitCode(status: number): ExitCode {
  if (status === 401 || status === 403) return EXIT_CODES.auth;
  if (status === 404) return EXIT_CODES.notFound;
  return EXIT_CODES.error;
}

/** The error object printed on stderr, inside `{ "error": ... }`. */
export interface ErrorBody {
  code: string;
  type: string;
  message: string;
  link?: string;
  hint?: string;
}

export interface MeiliCliErrorOptions {
  /** A full sentence that names the next command to run. */
  hint?: string;
  /**
   * Overrides the default exit code of the code. Used only for the cases
   * documented in output.md, such as an unknown context name (exit 4).
   */
  exitCode?: ExitCode;
  cause?: unknown;
}

/** The only error class commands may throw. */
export class MeiliCliError extends Error {
  readonly code: CliErrorCode;
  readonly exitCode: ExitCode;
  readonly hint: string | undefined;

  constructor(code: CliErrorCode, message: string, options: MeiliCliErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "MeiliCliError";
    this.code = code;
    this.exitCode = options.exitCode ?? CLI_ERROR_CODES[code];
    this.hint = options.hint;
  }

  toBody(): ErrorBody {
    const body: ErrorBody = { code: this.code, type: "cli", message: this.message };
    if (this.hint !== undefined) body.hint = this.hint;
    return body;
  }
}

/** An error ready to be written on stderr. */
export interface RenderedError {
  body: ErrorBody;
  exitCode: number;
  /** Stack trace of the original error, printed only with --debug. */
  stack: string | undefined;
}

const HELP_SUFFIX = /\n?See more help with --help\.?\s*$/;

/** Converts anything thrown during a command into a contract error. */
export function toRenderedError(error: unknown): RenderedError {
  if (error instanceof MeiliCliError) {
    return { body: error.toBody(), exitCode: error.exitCode, stack: error.stack };
  }

  if (error instanceof MeilisearchApiError) {
    const status = error.response.status;
    if (error.cause !== undefined) {
      const body: ErrorBody = {
        code: error.cause.code,
        type: error.cause.type,
        message: error.cause.message,
        link: error.cause.link,
      };
      if (status === 401 || status === 403) {
        body.hint = "Provide an API key with `--api-key <key>` or `MEILI_API_KEY`.";
      }
      return { body, exitCode: engineExitCode(status), stack: error.stack };
    }
    // An HTTP error without a Meilisearch error body: a proxy or a wrong URL answered.
    return {
      body: {
        code: "cli_network",
        type: "cli",
        message: `${serverName(error.response.url)} answered HTTP ${status} without a Meilisearch error body.`,
      },
      exitCode: EXIT_CODES.network,
      stack: error.stack,
    };
  }

  if (error instanceof MeilisearchRequestTimeOutError) {
    return {
      body: {
        code: "cli_timeout",
        type: "cli",
        message: `The HTTP request timed out after ${error.cause.timeout} ms.`,
      },
      exitCode: EXIT_CODES.timeout,
      stack: error.stack,
    };
  }

  if (error instanceof MeilisearchRequestError) {
    return {
      body: { code: "cli_network", type: "cli", message: networkMessage(error) },
      exitCode: EXIT_CODES.network,
      stack: error.stack,
    };
  }

  if (error instanceof Errors.ExitError) {
    // Already rendered upstream. Keep the exit code, print nothing.
    return {
      body: { code: "cli_internal", type: "cli", message: error.message },
      exitCode: error.oclif.exit ?? EXIT_CODES.error,
      stack: undefined,
    };
  }

  if (error instanceof Errors.CLIError) {
    // oclif parse errors and "command not found". Their exit code is 2 by default.
    const message = usageMessage(error.message);
    return {
      body: {
        code: "cli_usage",
        type: "cli",
        message,
        hint: "Run `meili --help` or `meili <command> --help` to see the usage.",
      },
      exitCode: EXIT_CODES.usage,
      stack: error.stack,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    body: {
      code: "cli_internal",
      type: "cli",
      message: `Unexpected error: ${message}`,
      hint: "This is a bug in meili. Run the command again with `--debug` and report the trace.",
    },
    exitCode: EXIT_CODES.error,
    stack: error instanceof Error ? error.stack : undefined,
  };
}

const NOT_FOUND = /^command (\S+) not found$/;

/** oclif joins command ids with ":" in its messages; the CLI uses spaces. */
function usageMessage(message: string): string {
  const cleaned = message.replace(HELP_SUFFIX, "");
  const notFound = cleaned.match(NOT_FOUND);
  if (notFound?.[1] !== undefined) {
    return `Command \`${notFound[1].replaceAll(":", " ")}\` not found.`;
  }
  return cleaned;
}

function serverName(url: string): string {
  return url === "" ? "The server" : `The server at ${url}`;
}

function networkMessage(error: MeilisearchRequestError): string {
  const reason = deepestCauseMessage(error.cause);
  const target = error.message.match(/https?:\/\/\S+/)?.[0];
  const where = target === undefined ? "the Meilisearch instance" : target.replace(/\/$/, "");
  return reason === undefined
    ? `Cannot connect to ${where}.`
    : `Cannot connect to ${where}: ${reason}.`;
}

function deepestCauseMessage(cause: unknown): string | undefined {
  let current = cause;
  let message: string | undefined;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current.message !== "") message = current.message;
    current = current.cause;
  }
  return message?.replace(/\.$/, "");
}

export interface RenderErrorOptions {
  mode: OutputMode;
  /** Indent the JSON. True when stderr is a TTY. */
  pretty: boolean;
  /** Append the stack trace. Only with --debug. */
  debug: boolean;
}

/** Formats an error for stderr: one JSON document, or a short text in table mode. */
export function formatError(rendered: RenderedError, options: RenderErrorOptions): string {
  const lines: string[] = [];
  if (options.mode === "table") {
    const { body } = rendered;
    lines.push(`${body.code}: ${body.message}`);
    if (body.hint !== undefined) lines.push(body.hint);
    if (body.link !== undefined) lines.push(body.link);
  } else {
    const document = { error: rendered.body };
    lines.push(options.pretty ? JSON.stringify(document, null, 2) : JSON.stringify(document));
  }
  if (options.debug && rendered.stack !== undefined) lines.push(rendered.stack);
  return `${lines.join("\n")}\n`;
}

/** Writes a rendered error on stderr. Nothing ever goes to stdout from here. */
export function writeError(rendered: RenderedError, options: RenderErrorOptions): void {
  process.stderr.write(formatError(rendered, options));
}

/**
 * Last-resort handler for bin/run.js: errors thrown before a command exists
 * (unknown command, bad global flags on a topic) or escaped from one.
 * Errors already rendered by BaseCommand arrive as ExitError and print nothing.
 */
export function handleFatalError(error: unknown, argv: readonly string[]): void {
  const rendered = toRenderedError(error);
  if (!(error instanceof Errors.ExitError)) {
    const mode = resolveOutputModeFromArgv(argv, process.env, process.stdout.isTTY === true);
    writeError(rendered, {
      mode,
      pretty: process.stderr.isTTY === true,
      debug: argv.includes("--debug"),
    });
  }
  process.exitCode = rendered.exitCode;
}
