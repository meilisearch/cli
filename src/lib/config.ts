/**
 * Configuration contract: connection resolution, environment variables, config
 * file and secret redaction. See docs/contract/config.md.
 *
 * This file, output.ts and errors.ts implement the contract. They change only
 * through a contract pull request.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXIT_CODES, MeiliCliError } from "./errors.js";

export type Env = Readonly<Record<string, string | undefined>>;

/** Names of the environment variables the CLI reads. Nothing reads `process.env.MEILI_*` directly. */
export const ENV = {
  URL: "MEILI_URL",
  API_KEY: "MEILI_API_KEY",
  CONTEXT: "MEILI_CONTEXT",
  MANAGEMENT_TOKEN: "MEILI_MANAGEMENT_TOKEN",
  MANAGEMENT_URL: "MEILI_MANAGEMENT_URL",
  OUTPUT: "MEILI_OUTPUT",
  TIMEOUT: "MEILI_TIMEOUT",
  CONFIG_DIR: "MEILI_CONFIG_DIR",
  NO_COLOR: "NO_COLOR",
} as const;

export const DEFAULT_MANAGEMENT_URL = "https://api.meilisearch.com";

/** The table of docs/contract/config.md, in the same order. Rendered in `meili --help`. */
export const ENV_VARS: ReadonlyArray<{ name: string; description: string }> = [
  { name: ENV.URL, description: "Engine URL." },
  { name: ENV.API_KEY, description: "Engine API key." },
  { name: ENV.CONTEXT, description: "Name of the context to use when --context is absent." },
  { name: ENV.MANAGEMENT_TOKEN, description: "Management API personal access token." },
  {
    name: ENV.MANAGEMENT_URL,
    description: `Management API base URL. Default ${DEFAULT_MANAGEMENT_URL}.`,
  },
  { name: ENV.OUTPUT, description: "Default output mode: json, ndjson, table." },
  { name: ENV.TIMEOUT, description: "Default --timeout for --wait." },
  { name: ENV.CONFIG_DIR, description: "Overrides the config directory." },
  { name: ENV.NO_COLOR, description: "Disables colors when set to any value." },
];

// Config file

export interface ContextEntry {
  url: string;
  apiKey?: string;
}

export interface ConfigFile {
  version: 1;
  defaultContext?: string;
  contexts: Record<string, ContextEntry>;
  management?: { token?: string };
}

export const CONFIG_FILE_NAME = "config.json";

export interface ResolveConfigDirOptions {
  env: Env;
  platform?: NodeJS.Platform;
  /** oclif's `config.configDir`, used on Windows only. */
  oclifConfigDir?: string;
}

/**
 * `$MEILI_CONFIG_DIR`, else `$XDG_CONFIG_HOME/meili`, else `~/.config/meili`.
 * On Windows, the oclif config directory. Returns undefined when nothing can be
 * determined: the CLI keeps working with flags and environment variables.
 */
export function resolveConfigDir(options: ResolveConfigDirOptions): string | undefined {
  const { env } = options;
  const platform = options.platform ?? process.platform;
  const explicit = env[ENV.CONFIG_DIR];
  if (explicit !== undefined && explicit !== "") return explicit;
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg !== undefined && xdg !== "") return join(xdg, "meili");
  if (platform === "win32") return options.oclifConfigDir;
  const home = env.HOME;
  if (home !== undefined && home !== "") return join(home, ".config", "meili");
  return undefined;
}

/**
 * Reads and validates the config file. Absent file: undefined. Invalid file:
 * `cli_config` with the line and column of a syntax error, or the path of an
 * invalid field. Never creates the file.
 */
export function readConfigFile(path: string): ConfigFile | undefined {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return undefined;
    throw new MeiliCliError(
      "cli_config",
      `Cannot read the config file ${path}: ${errorMessage(error)}`,
      {
        cause: error,
      },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const location = jsonErrorLocation(errorMessage(error), raw);
    throw new MeiliCliError(
      "cli_config",
      `Invalid JSON in ${path} at ${location}: ${errorMessage(error)}`,
      {
        cause: error,
      },
    );
  }
  return validateConfigFile(parsed, path);
}

function validateConfigFile(value: unknown, path: string): ConfigFile {
  const invalid = (field: string, expected: string): MeiliCliError =>
    new MeiliCliError(
      "cli_config",
      `Invalid config file ${path}: \`${field}\` must be ${expected}.`,
    );

  if (!isRecord(value)) throw invalid("<root>", "an object");
  if (value.version !== 1) throw invalid("version", "1");

  const contexts: Record<string, ContextEntry> = {};
  if (value.contexts !== undefined) {
    if (!isRecord(value.contexts)) throw invalid("contexts", "an object");
    for (const [name, entry] of Object.entries(value.contexts)) {
      if (!isRecord(entry)) throw invalid(`contexts.${name}`, "an object");
      if (typeof entry.url !== "string" || entry.url === "") {
        throw invalid(`contexts.${name}.url`, "a non-empty string");
      }
      if (entry.apiKey !== undefined && typeof entry.apiKey !== "string") {
        throw invalid(`contexts.${name}.apiKey`, "a string");
      }
      contexts[name] =
        entry.apiKey === undefined ? { url: entry.url } : { url: entry.url, apiKey: entry.apiKey };
    }
  }

  const file: ConfigFile = { version: 1, contexts };

  if (value.defaultContext !== undefined) {
    if (typeof value.defaultContext !== "string") throw invalid("defaultContext", "a string");
    if (contexts[value.defaultContext] === undefined) {
      throw invalid(
        "defaultContext",
        `the name of a context in \`contexts\`, got \`${value.defaultContext}\``,
      );
    }
    file.defaultContext = value.defaultContext;
  }

  if (value.management !== undefined) {
    if (!isRecord(value.management)) throw invalid("management", "an object");
    if (value.management.token !== undefined && typeof value.management.token !== "string") {
      throw invalid("management.token", "a string");
    }
    file.management = value.management.token === undefined ? {} : { token: value.management.token };
  }

  return file;
}

/**
 * "line 4 column 21" for a JSON.parse failure. V8 gives a position for most
 * errors. For "Unexpected token" it gives up to ten characters of context on
 * each side of the token instead, so the position is recovered from that context.
 */
const CONTEXT_CHARS = 10;

function jsonErrorLocation(message: string, raw: string): string {
  const explicit = message.match(/\(line (\d+) column (\d+)\)/);
  if (explicit) return `line ${explicit[1]} column ${explicit[2]}`;
  const offset = jsonErrorOffset(message, raw);
  if (offset === undefined) return "an unknown position";
  const before = raw.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - before.lastIndexOf("\n");
  return `line ${line} column ${column}`;
}

function jsonErrorOffset(message: string, raw: string): number | undefined {
  const position = message.match(/position (\d+)/);
  if (position) return Number(position[1]);
  if (message.includes("Unexpected end of JSON input")) return raw.length;
  const token = message.match(/^Unexpected token '(.)', ([\s\S]*) is not valid JSON$/);
  if (token === null) return undefined;
  const [, tokenChar = "", context = ""] = token;
  const surround = context.match(/^\.\.\."([\s\S]*)"\.\.\.$/);
  const tail = context.match(/^\.\.\."([\s\S]*)"$/);
  const head = context.match(/^"([\s\S]*)"\.\.\.$/);
  const whole = context.match(/^"([\s\S]*)"$/);
  if (surround || tail) {
    const snippet = (surround ?? tail)?.[1] ?? "";
    const index = raw.indexOf(snippet);
    return index === -1 ? undefined : index + CONTEXT_CHARS;
  }
  if (head) return Math.max(0, (head[1] ?? "").length - CONTEXT_CHARS - 1);
  if (whole) {
    const index = raw.indexOf(tokenChar);
    return index === -1 ? undefined : index;
  }
  return undefined;
}

// Engine connection

export type Source = "flag" | "env" | `context:${string}`;

export interface EngineFlags {
  url?: string | undefined;
  apiKey?: string | undefined;
  context?: string | undefined;
}

export interface EngineConnection {
  url: string;
  apiKey: string | undefined;
  sources: { url: Source; apiKey: Source | undefined };
}

export interface ResolveEngineOptions {
  flags: EngineFlags;
  env: Env;
  file: ConfigFile | undefined;
  /** Path of the config file, for error messages. */
  filePath?: string | undefined;
}

/**
 * Flags, then environment variables, then the context named by `--context` or
 * `MEILI_CONTEXT`, then the default context. Field by field. Never falls back
 * to localhost.
 */
export function resolveEngineConnection(options: ResolveEngineOptions): EngineConnection {
  const { flags, env, file } = options;
  const context = selectContext(
    flags.context ?? nonEmpty(env[ENV.CONTEXT]),
    file,
    options.filePath,
  );

  const url = pick([
    ["flag", flags.url],
    ["env", nonEmpty(env[ENV.URL])],
    [context?.source, context?.entry.url],
  ]);
  if (url === undefined) {
    throw new MeiliCliError(
      "cli_config",
      "No Meilisearch URL configured. Provide one with the `--url` flag, the `MEILI_URL` environment variable, or a context from the config file (`--context <name>`, `MEILI_CONTEXT`, or the default context).",
    );
  }

  const apiKey = pick([
    ["flag", flags.apiKey],
    ["env", nonEmpty(env[ENV.API_KEY])],
    [context?.source, context?.entry.apiKey],
  ]);

  return {
    url: url.value,
    apiKey: apiKey?.value,
    sources: { url: url.source, apiKey: apiKey?.source },
  };
}

function selectContext(
  name: string | undefined,
  file: ConfigFile | undefined,
  filePath: string | undefined,
): { source: Source; entry: ContextEntry } | undefined {
  if (name !== undefined) {
    const entry = file?.contexts[name];
    if (entry === undefined) {
      const where =
        filePath === undefined
          ? "no config directory could be determined"
          : file === undefined
            ? `no config file found at ${filePath}`
            : `not defined in ${filePath}`;
      throw new MeiliCliError("cli_config", `Context \`${name}\` not found: ${where}.`, {
        exitCode: EXIT_CODES.notFound,
        hint: "Run `meili context list` to see the available contexts.",
      });
    }
    return { source: `context:${name}`, entry };
  }
  if (file?.defaultContext !== undefined) {
    const entry = file.contexts[file.defaultContext];
    if (entry !== undefined) return { source: `context:${file.defaultContext}`, entry };
  }
  return undefined;
}

// Management API credentials

export interface ManagementFlags {
  managementToken?: string | undefined;
}

export interface ManagementCredentials {
  token: string;
  url: string;
  sources: { token: Source | "config"; url: "env" | "default" };
}

export interface ResolveManagementOptions {
  flags: ManagementFlags;
  env: Env;
  file: ConfigFile | undefined;
}

/**
 * `--management-token`, then `MEILI_MANAGEMENT_TOKEN`, then the token stored by
 * `meili management login`. Fails before any network call when nothing is found.
 */
export function resolveManagementCredentials(
  options: ResolveManagementOptions,
): ManagementCredentials {
  const { flags, env, file } = options;
  const token = pick<Source | "config">([
    ["flag", flags.managementToken],
    ["env", nonEmpty(env[ENV.MANAGEMENT_TOKEN])],
    ["config", nonEmpty(file?.management?.token)],
  ]);
  if (token === undefined) {
    throw new MeiliCliError(
      "cli_auth_missing",
      "No management API token configured. Provide one with the `--management-token` flag, the `MEILI_MANAGEMENT_TOKEN` environment variable, or `meili management login`.",
      {
        hint: "Create a personal access token in the Meilisearch Cloud dashboard, then run `meili management login --token <pat>`.",
      },
    );
  }
  const envUrl = nonEmpty(env[ENV.MANAGEMENT_URL]);
  return {
    token: token.value,
    url: envUrl ?? DEFAULT_MANAGEMENT_URL,
    sources: { token: token.source, url: envUrl === undefined ? "default" : "env" },
  };
}

// Secrets

/** `****1a2b`: the last four characters only. Shorter values are fully masked. */
export function maskSecret(value: string): string {
  return value.length > 4 ? `****${value.slice(-4)}` : "****";
}

/** Body fields whose value is a secret, as listed in config.md. */
export const REDACTED_FIELDS: ReadonlySet<string> = new Set(["apiKey", "key", "token"]);

const REDACTED_HEADERS: ReadonlySet<string> = new Set(["authorization", "x-meili-api-key"]);

/** Masks the `Authorization` header (and the legacy `X-Meili-API-Key`) in a header map. */
export function redactHeaders(headers: Iterable<[string, string]>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of headers) {
    if (REDACTED_HEADERS.has(name.toLowerCase())) {
      const [scheme, ...rest] = value.split(" ");
      result[name] =
        rest.length > 0 && scheme !== undefined
          ? `${scheme} ${maskSecret(rest.join(" "))}`
          : maskSecret(value);
    } else {
      result[name] = value;
    }
  }
  return result;
}

/** Deep copy of a JSON value with every `apiKey`, `key` and `token` field masked. */
export function redactBody(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactBody);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    if (REDACTED_FIELDS.has(field)) {
      result[field] = typeof fieldValue === "string" ? maskSecret(fieldValue) : "****";
    } else {
      result[field] = redactBody(fieldValue);
    }
  }
  return result;
}

// Helpers

function pick<S extends string>(
  candidates: ReadonlyArray<[S | undefined, string | undefined]>,
): { source: S; value: string } | undefined {
  for (const [source, value] of candidates) {
    if (source !== undefined && value !== undefined) return { source, value };
  }
  return undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
