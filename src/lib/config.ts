/**
 * Configuration contract: projects, the config file, connection resolution,
 * environment variables and secret redaction. See docs/contract/config.md.
 *
 * This file, output.ts and errors.ts implement the contract. They change only
 * through a contract pull request.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MeiliCliError } from "./errors.js";

export type Env = Readonly<Record<string, string | undefined>>;

/** Names of the environment variables the CLI reads. Nothing reads `process.env.MEILI_*` directly. */
export const ENV = {
  PROJECT_URL: "MEILI_PROJECT_URL",
  PROJECT_API_KEY: "MEILI_PROJECT_API_KEY",
  CONFIG: "MEILI_CONFIG",
  MANAGEMENT_TOKEN: "MEILI_MANAGEMENT_TOKEN",
  MANAGEMENT_URL: "MEILI_MANAGEMENT_URL",
  MANAGEMENT_CLIENT_ID: "MEILI_MANAGEMENT_CLIENT_ID",
  MANAGEMENT_DASHBOARD_URL: "MEILI_MANAGEMENT_DASHBOARD_URL",
  OUTPUT: "MEILI_OUTPUT",
  TIMEOUT: "MEILI_TIMEOUT",
} as const;

export const DEFAULT_MANAGEMENT_URL = "https://api.meilisearch.com";
export const DEFAULT_MANAGEMENT_DASHBOARD_URL = "https://cloud.meilisearch.com";
/**
 * The OAuth application of this CLI on Meilisearch Cloud, which `auth login`
 * identifies itself with. A client id is public by definition: it names the
 * application on the consent page, it is not a secret. See ADR 0009.
 */
export const DEFAULT_MANAGEMENT_CLIENT_ID = "0sZKkuuaL3xcitNgKUchid3Vz4sHPslxQNFn_d_9rck";

/**
 * The table of docs/contract/config.md, in the same order. Rendered in `meili --help`.
 * `flag` names the flag that carries the same setting: the two share their name,
 * `MEILI_` plus the flag name in upper snake case (CLAUDE.md, rule 14).
 */
export const ENV_VARS: ReadonlyArray<{ name: string; description: string; flag?: string }> = [
  {
    name: ENV.PROJECT_URL,
    description: "Project URL, the Meilisearch instance to talk to.",
    flag: "project-url",
  },
  { name: ENV.PROJECT_API_KEY, description: "Project API key.", flag: "project-api-key" },
  {
    name: ENV.CONFIG,
    description:
      "Config file path. Default ~/.config/meili/config.json. Give each agent its own file, read-only.",
  },
  { name: ENV.MANAGEMENT_TOKEN, description: "Management API personal access token." },
  {
    name: ENV.MANAGEMENT_URL,
    description: `Management API base URL. Default ${DEFAULT_MANAGEMENT_URL}.`,
  },
  {
    name: ENV.MANAGEMENT_CLIENT_ID,
    description:
      "OAuth application the `auth login` command identifies itself with. Default: the one of this CLI on Meilisearch Cloud.",
  },
  {
    name: ENV.MANAGEMENT_DASHBOARD_URL,
    description: `Dashboard URL, which hosts the consent page of \`auth login\`. Default ${DEFAULT_MANAGEMENT_DASHBOARD_URL}.`,
  },
  { name: ENV.OUTPUT, description: "Default output mode: json or ndjson.", flag: "output" },
  { name: ENV.TIMEOUT, description: "Default --timeout for --wait.", flag: "timeout" },
];

// Config file

export interface ProjectEntry {
  url: string;
  apiKey?: string;
}

export interface ConfigFile {
  path: string;
  projects: Record<string, ProjectEntry>;
}

/** `$MEILI_CONFIG`, else `$XDG_CONFIG_HOME/meili/config.json`, else `~/.config/meili/config.json`. */
export function configFilePath(env: Env): string {
  return (
    nonEmpty(env[ENV.CONFIG]) ??
    join(nonEmpty(env.XDG_CONFIG_HOME) ?? join(homedir(), ".config"), "meili", "config.json")
  );
}

/**
 * The config file; no projects when it does not exist. A file readable by
 * others holds API keys that others can read: `warn` receives it, and the
 * file is read anyway. Windows has no file modes, so no check there.
 */
export function readConfigFile(path: string, warn: (warning: MeiliCliError) => void): ConfigFile {
  const text = readOwnerOnly(path, "config", warn);
  if (text === undefined) return { path, projects: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new MeiliCliError("cli_config", `The config file ${path} is not valid JSON.`, { cause });
  }
  return { path, projects: parseProjects(parsed, path) };
}

function parseProjects(parsed: unknown, path: string): Record<string, ProjectEntry> {
  const shape = () =>
    new MeiliCliError(
      "cli_config",
      `The config file ${path} must be {"projects": {"<name>": {"url": "...", "apiKey": "..."}}}.`,
    );
  const projects = isRecord(parsed) ? parsed.projects : undefined;
  if (!isRecord(projects)) throw shape();
  const result: Record<string, ProjectEntry> = {};
  for (const [name, entry] of Object.entries(projects)) {
    if (!isRecord(entry) || typeof entry.url !== "string") throw shape();
    if (entry.apiKey !== undefined && typeof entry.apiKey !== "string") throw shape();
    result[name] =
      entry.apiKey === undefined ? { url: entry.url } : { url: entry.url, apiKey: entry.apiKey };
  }
  return result;
}

export function writeConfigFile(file: ConfigFile): void {
  writeSecretFile(file.path, { projects: file.projects });
}

/**
 * Writes a file of secrets owner-only and atomically: a command reading it
 * meanwhile sees the previous file or the new one, never a half-written one.
 * The temporary file is created exclusively, under an unpredictable name: a
 * pre-existing file or symlink at that path, in a shared directory, would
 * receive the secrets and keep its own permissions.
 */
export function writeSecretFile(path: string, content: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(content, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  renameSync(temporary, path);
}

/**
 * The file, or undefined when it does not exist. A file readable by others
 * holds secrets that others can read: `warn` receives it, and the file is read
 * anyway. Windows has no file modes, so no check there.
 */
export function readOwnerOnly(
  path: string,
  what: string,
  warn: (warning: MeiliCliError) => void,
): string | undefined {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return undefined;
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    warn(
      new MeiliCliError("cli_config", `The ${what} file ${path} is readable by others.`, {
        hint: `Run \`chmod 600 ${path}\`.`,
      }),
    );
  }
  return readFileSync(path, "utf8");
}

// Project connection

export interface ProjectFlags {
  url?: string | undefined;
  apiKey?: string | undefined;
  project?: string | undefined;
}

export interface ProjectConnection {
  url: string;
  apiKey: string | undefined;
}

/**
 * The rules of docs/contract/config.md, "Resolution: nothing is deduced". The
 * command line wins, and the file is read only past that rule; otherwise
 * exactly one ambient source must define exactly one project, or the error
 * says what was found. Never falls back to localhost.
 */
export function resolveProjectConnection(
  flags: ProjectFlags,
  env: Env,
  readFile: () => ConfigFile,
): ProjectConnection {
  if (flags.url !== undefined) {
    if (flags.project !== undefined) {
      throw new MeiliCliError(
        "cli_usage",
        "`--project` cannot be combined with `--project-url`: the name and the URL contradict each other.",
      );
    }
    return { url: flags.url, apiKey: flags.apiKey };
  }

  const file = readFile();
  const names = Object.keys(file.projects);
  if (flags.project !== undefined) {
    const entry = projectOf(file, flags.project);
    return { url: entry.url, apiKey: flags.apiKey ?? entry.apiKey };
  }

  const envUrl = nonEmpty(env[ENV.PROJECT_URL]);
  if (envUrl !== undefined && names.length > 0) {
    throw new MeiliCliError(
      "cli_config",
      `Both \`MEILI_PROJECT_URL\` and the config file ${file.path} define a project.`,
      { hint: "Unset the variable, or point `MEILI_CONFIG` at a file that does not exist." },
    );
  }
  if (envUrl !== undefined) {
    return { url: envUrl, apiKey: flags.apiKey ?? nonEmpty(env[ENV.PROJECT_API_KEY]) };
  }
  if (names.length > 1) {
    throw new MeiliCliError(
      "cli_config",
      `Pick a project with \`--project\`: ${names.join(", ")}.`,
    );
  }
  const entry = Object.values(file.projects)[0];
  if (entry !== undefined) return { url: entry.url, apiKey: flags.apiKey ?? entry.apiKey };
  throw new MeiliCliError(
    "cli_config",
    `No project configured. Provide one with the \`--project-url\` flag, the \`MEILI_PROJECT_URL\` environment variable, or a config file at ${file.path}.`,
  );
}

/** The named entry, or `cli_config` with the path and the names the file has. */
export function projectOf(file: ConfigFile, name: string): ProjectEntry {
  const entry = file.projects[name];
  if (entry === undefined) {
    throw new MeiliCliError(
      "cli_config",
      `No project \`${name}\` in ${file.path}. Projects: ${Object.keys(file.projects).join(", ") || "none"}.`,
    );
  }
  return entry;
}

// Secrets

/** `****1a2b`: the last four characters only. Shorter values are fully masked. */
export function maskSecret(value: string): string {
  return value.length > 4 ? `****${value.slice(-4)}` : "****";
}

/** Body fields whose value is a secret, as listed in config.md. `apikey` is the Management API's spelling. */
export const REDACTED_FIELDS: ReadonlySet<string> = new Set([
  "apiKey",
  "apikey",
  "key",
  "token",
  "access_token",
  "refresh_token",
]);

const REDACTED_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "x-meili-api-key",
  "cookie",
  "set-cookie",
]);

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

/** Deep copy of a JSON value with every secret field masked. */
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

export function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
