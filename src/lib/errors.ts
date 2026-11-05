/**
 * Error contract: codes, exit codes and rendering. See docs/contract/output.md.
 *
 * This file, output.ts and config.ts implement the contract. They change only
 * through a contract pull request.
 */
import { stripVTControlCharacters } from "node:util";
import { Errors } from "@oclif/core";
import {
  MeilisearchApiError,
  MeilisearchRequestError,
  MeilisearchRequestTimeOutError,
} from "meilisearch";

/** Exit codes, as listed in the table of docs/contract/output.md. */
export const EXIT_CODES = {
  success: 0,
  error: 1,
  usage: 2,
  auth: 3,
  notFound: 4,
  timeout: 5,
  network: 6,
  taskFailed: 7,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/** Codes of errors raised by the CLI itself, with their default exit code. */
export const CLI_ERROR_CODES = {
  cli_usage: EXIT_CODES.usage,
  cli_config: EXIT_CODES.usage,
  cli_auth_missing: EXIT_CODES.auth,
  cli_auth_failed: EXIT_CODES.auth,
  cli_timeout: EXIT_CODES.timeout,
  cli_network: EXIT_CODES.network,
  cli_task_failed: EXIT_CODES.taskFailed,
  cli_input_invalid: EXIT_CODES.usage,
  cli_internal: EXIT_CODES.error,
} as const;

export type CliErrorCode = keyof typeof CLI_ERROR_CODES;

/** Exit code of an API error, from its HTTP status. Both APIs answer the same shape. */
export function apiExitCode(status: number): ExitCode {
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
  /** Overrides the default exit code of the code. Only for a case documented in output.md. */
  exitCode?: ExitCode;
  cause?: unknown;
}

/**
 * A non-2xx answer of the Management API. Its body is the error object of the
 * document, the same shape as a Meilisearch one, and it is passed through
 * (docs/contract/output.md, "Errors"); `body` is undefined when the answer
 * carried none, which is not the API answering.
 */
export class ManagementApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly url: string;

  constructor(status: number, body: unknown, url: string) {
    super(parseErrorBody(body)?.message ?? `The Management API answered HTTP ${status} to ${url}.`);
    this.name = "ManagementApiError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

/** The error object of either API, or undefined when the body is not one. */
export function parseErrorBody(body: unknown): ErrorBody | undefined {
  if (!isRecord(body)) return undefined;
  const { message, code, type, link } = body;
  if (typeof message !== "string" || typeof code !== "string" || typeof type !== "string") {
    return undefined;
  }
  return { code, type, message, ...(typeof link === "string" ? { link } : {}) };
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

/**
 * Both APIs answer the same error object, so both are rendered the same way:
 * the body passed through, the API's hint for that status, and the exit code
 * of the status. No error body at all is a proxy or a wrong URL, not the API.
 */
function renderApiError(
  error: Error,
  status: number,
  url: string,
  sent: unknown,
  api: { name: string; hint: (status: number) => string | undefined },
): RenderedError {
  const body = parseErrorBody(sent);
  if (body === undefined) {
    return {
      body: {
        code: "cli_network",
        type: "cli",
        message: `${serverName(url)} answered HTTP ${status} without a ${api.name} error body.`,
      },
      exitCode: EXIT_CODES.network,
      stack: error.stack,
    };
  }
  const hint = api.hint(status);
  if (hint !== undefined) body.hint = hint;
  return { body, exitCode: apiExitCode(status), stack: error.stack };
}

/**
 * Converts anything thrown during a command into a contract error. `commandIds`
 * are the commands of the manifest, `index list`, for the hint of an unknown command.
 * `managementTokenFromEnv` says the Management API token came from
 * `MEILI_MANAGEMENT_TOKEN`, which a new login would not replace.
 */
export function toRenderedError(
  error: unknown,
  commandIds: readonly string[] = [],
  managementTokenFromEnv = false,
  argv: readonly string[] = [],
): RenderedError {
  if (error instanceof MeiliCliError) {
    return { body: error.toBody(), exitCode: error.exitCode, stack: error.stack };
  }

  if (error instanceof MeilisearchApiError) {
    return renderApiError(error, error.response.status, error.response.url, error.cause, {
      name: "Meilisearch",
      hint: (status) =>
        status === 401 || status === 403
          ? "Provide an API key with `--project-api-key <key>`."
          : undefined,
    });
  }

  if (error instanceof ManagementApiError) {
    return renderApiError(error, error.status, error.url, error.body, {
      name: "Management API",
      // A 403 is a right the account lacks: no new credential grants it.
      hint: (status) =>
        status !== 401
          ? undefined
          : managementTokenFromEnv
            ? "Unset or replace `MEILI_MANAGEMENT_TOKEN`: it is used in place of the session of `meili auth login`."
            : "Run `meili auth login` to log in again.",
    });
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
    // oclif colors parts of its messages in a terminal: the JSON carries none of it.
    const cleaned = cleanedMessage(error);
    const typed = typedCommand(error);
    return {
      body: {
        code: "cli_usage",
        type: "cli",
        message: typed === undefined ? cleaned : `Command \`${typed}\` not found.`,
        hint: usageHint(unknownCommand(error, commandIds, argv)),
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

/** oclif joins command ids with ":" in its messages, or with spaces when no topic matches. */
const NOT_FOUND = /^command (.+) not found$/;

const cleanedMessage = (error: Errors.CLIError): string =>
  stripVTControlCharacters(error.message).replace(HELP_SUFFIX, "");

/** What was typed, `get indexes`, when oclif found no command of that name. */
const typedCommand = (error: Errors.CLIError): string | undefined =>
  cleanedMessage(error).match(NOT_FOUND)?.[1]?.replaceAll(":", " ");

/**
 * What an unknown command is closest to. `positional`: a command followed by a
 * value, which meili never takes. `typo`: a typo, the order of another CLI, or
 * both. `suggestion` is a command of the manifest, never what was typed, which
 * can hold a value.
 */
export type UnknownCommand =
  | { reason: "positional" | "typo"; suggestion: string }
  | { reason: "none" };

/** The unknown command of a `command not found` error, for its usage event (ADR 0019). */
export function unknownCommand(
  error: unknown,
  commandIds: readonly string[],
  argv: readonly string[],
): UnknownCommand | undefined {
  const typed = error instanceof Errors.CLIError ? typedCommand(error) : undefined;
  return typed === undefined ? undefined : closestTo(typed, commandIds, argv);
}

function closestTo(
  typed: string,
  commandIds: readonly string[],
  argv: readonly string[],
): UnknownCommand {
  const command = commandIds.find((id) => typed.startsWith(`${id} `));
  if (command !== undefined) return { reason: "positional", suggestion: command };
  // `--id` names one item: `meili get indexes --id movies` is `meili index view --id movies`.
  const oneItem = argv.some((arg) => arg === "--id" || arg.startsWith("--id="));
  const closest = closestCommand(typed, commandIds, oneItem);
  return closest === undefined ? { reason: "none" } : { reason: "typo", suggestion: closest };
}

function usageHint(unknown: UnknownCommand | undefined): string {
  if (unknown === undefined || unknown.reason === "none") {
    return "Run `meili --help` or `meili <command> --help` to see the usage.";
  }
  const command = unknown.suggestion;
  return unknown.reason === "positional"
    ? `\`meili ${command}\` takes no positional argument: give each value with its flag. Run \`meili ${command} --help\` to see them.`
    : `Did you mean \`meili ${command}\`?`;
}

/** Words of other CLIs, and the word of meili they mean. */
const SYNONYMS: Record<string, string> = {
  get: "list",
  ls: "list",
  show: "view",
  create: "add",
  edit: "update",
  remove: "delete",
  rm: "delete",
};

/**
 * The command closest to what was typed, when it is close enough to be a typo.
 * What was typed is also read with the words of other CLIs translated, in the
 * reverse order, and word by word: `get indexes` finds `index list`, `index
 * create` finds `index add`, `get health` finds `health`.
 */
export function closestCommand(
  typed: string,
  commandIds: readonly string[],
  oneItem = false,
): string | undefined {
  const words = typed
    .split(" ")
    .map((word) => (oneItem && word === "get" ? "view" : (SYNONYMS[word] ?? word)));
  const variants = new Set([typed, words.join(" "), [...words].reverse().join(" "), ...words]);
  let best: { id: string; distance: number } | undefined;
  for (const variant of variants) {
    const tolerance = Math.max(2, Math.floor(variant.length / 3));
    for (const id of commandIds) {
      const distance = editDistance(variant, id);
      if (distance <= tolerance && (best === undefined || distance < best.distance)) {
        best = { id, distance };
      }
    }
  }
  return best?.id;
}

/** Levenshtein distance. */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(above + 1, (row[j - 1] ?? 0) + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return row[b.length] ?? 0;
}

function serverName(url: string): string {
  return url === "" ? "The server" : `The server at ${url}`;
}

function networkMessage(error: MeilisearchRequestError): string {
  const target = error.message.match(/https?:\/\/\S+/)?.[0];
  const where = target === undefined ? "the Meilisearch instance" : target.replace(/\/$/, "");
  return cannotConnectMessage(where, error.cause);
}

/** The `cli_network` message: `Cannot connect to <where>`, with the deepest cause when there is one. */
export function cannotConnectMessage(where: string, cause: unknown): string {
  const reason = deepestCauseMessage(cause);
  return reason === undefined
    ? `Cannot connect to ${where}.`
    : `Cannot connect to ${where}: ${reason}.`;
}

/** The innermost reason of a wrapped error: `fetch failed` hides `ECONNREFUSED`. */
export function deepestCauseMessage(cause: unknown): string | undefined {
  let current = cause;
  let message: string | undefined;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current.message !== "") message = current.message;
    current = current.cause;
  }
  return message?.replace(/\.$/, "");
}

export interface RenderErrorOptions {
  /** Indent the JSON. True when stderr is a TTY. */
  pretty: boolean;
  /** Append the stack trace. Only with --debug. */
  debug: boolean;
}

/** Formats an error for stderr: one JSON document, then the stack trace with --debug. */
export function formatError(rendered: RenderedError, options: RenderErrorOptions): string {
  const document = { error: rendered.body };
  const lines = [options.pretty ? JSON.stringify(document, null, 2) : JSON.stringify(document)];
  if (options.debug && rendered.stack !== undefined) lines.push(rendered.stack);
  return `${lines.join("\n")}\n`;
}

/** Writes a rendered error on stderr. Nothing ever goes to stdout from here. */
export function writeError(rendered: RenderedError, options: RenderErrorOptions): void {
  process.stderr.write(formatError(rendered, options));
}

/**
 * One line for the human, on stderr, and only when a human is there to read it
 * (docs/contract/output.md, "Streams"). Data never goes through here.
 */
export function writeNotice(line: string): void {
  if (process.stderr.isTTY === true) process.stderr.write(`${line}\n`);
}

/**
 * Writes a warning on stderr, `{ "warning": ... }` in the shape of an error,
 * and the command goes on. Indented when stderr is a TTY, like errors. An API
 * error the command goes on through keeps the API's code.
 */
export function writeWarning(warning: MeiliCliError | ErrorBody): void {
  const document = { warning: warning instanceof MeiliCliError ? warning.toBody() : warning };
  const pretty = process.stderr.isTTY === true;
  process.stderr.write(
    `${pretty ? JSON.stringify(document, null, 2) : JSON.stringify(document)}\n`,
  );
}

/**
 * Last-resort handler for bin/run.js: errors thrown before a command exists
 * (unknown command, bad global flags on a topic) or escaped from one.
 * Errors already rendered by BaseCommand arrive as ExitError and print nothing.
 */
export function handleFatalError(
  error: unknown,
  argv: readonly string[],
  commandIds: readonly string[],
): void {
  const rendered = toRenderedError(error, commandIds, false, argv);
  if (!(error instanceof Errors.ExitError)) {
    writeError(rendered, {
      pretty: process.stderr.isTTY === true,
      debug: argv.includes("--debug"),
    });
  }
  process.exitCode = rendered.exitCode;
}

/** A JSON object, as opposed to an array, a scalar or null. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
