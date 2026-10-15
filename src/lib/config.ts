/**
 * Configuration contract: projects, the config file, connection resolution,
 * environment variables and secret redaction. See docs/contract/config.md.
 *
 * This file, output.ts and errors.ts implement the contract. They change only
 * through a contract pull request.
 */
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { isRecord, MeiliCliError } from "./errors.js";

export type Env = Readonly<Record<string, string | undefined>>;

/** Names of the environment variables the CLI reads. Nothing reads `process.env.MEILI_*` directly. */
export const ENV = {
  PROJECT_URL: "MEILI_PROJECT_URL",
  PROJECT_API_KEY: "MEILI_PROJECT_API_KEY",
  CONFIG: "MEILI_CONFIG",
  MANAGEMENT_TOKEN: "MEILI_MANAGEMENT_TOKEN",
  MANAGEMENT_URL: "MEILI_MANAGEMENT_URL",
  OUTPUT: "MEILI_OUTPUT",
  TIMEOUT: "MEILI_TIMEOUT",
} as const;

export const DEFAULT_MANAGEMENT_URL = "https://api.meilisearch.com";

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
  {
    name: ENV.MANAGEMENT_TOKEN,
    description: "Management API personal access token.",
    flag: "management-token",
  },
  {
    name: ENV.MANAGEMENT_URL,
    description: `Management API base URL. Default ${DEFAULT_MANAGEMENT_URL}.`,
    flag: "management-url",
  },
  { name: ENV.OUTPUT, description: "Default output mode: json or ndjson.", flag: "output" },
  { name: ENV.TIMEOUT, description: "Default --timeout for --wait.", flag: "timeout" },
];

// Config file

export interface ProjectEntry {
  url: string;
  apiKey?: string;
  /** The project's `id` in the Management API, for the management commands. */
  cloudId?: number;
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
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return { path, projects: {} };
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    warn(
      new MeiliCliError("cli_config", `The config file ${path} is readable by others.`, {
        hint: `Run \`chmod 600 ${path}\`.`,
      }),
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new MeiliCliError("cli_config", `The config file ${path} is not valid JSON.`, { cause });
  }
  return { path, projects: parseProjects(parsed, path) };
}

function parseProjects(parsed: unknown, path: string): Record<string, ProjectEntry> {
  const shape = () =>
    new MeiliCliError(
      "cli_config",
      `The config file ${path} must be {"projects": {"<name>": {"url": "...", "apiKey": "...", "cloudId": 1}}}, the key and the id optional.`,
    );
  const projects = isRecord(parsed) ? parsed.projects : undefined;
  if (!isRecord(projects)) throw shape();
  const result: Record<string, ProjectEntry> = {};
  for (const [name, { url, apiKey, cloudId }] of Object.entries(projects).map(
    ([name, entry]) => [name, isRecord(entry) ? entry : {}] as const,
  )) {
    if (typeof url !== "string") throw shape();
    if (apiKey !== undefined && typeof apiKey !== "string") throw shape();
    if (cloudId !== undefined && !(Number.isInteger(cloudId) && (cloudId as number) > 0))
      throw shape();
    result[name] = {
      url,
      ...(apiKey === undefined ? {} : { apiKey }),
      ...(cloudId === undefined ? {} : { cloudId: cloudId as number }),
    };
  }
  return result;
}

/**
 * Writes the file owner-only and atomically: a command reading it meanwhile
 * sees the previous file or the new one, never a half-written one. The
 * temporary file is created exclusively: a pre-existing file or symlink at
 * that path, in a shared directory, would receive the keys.
 */
export function writeConfigFile(file: ConfigFile): void {
  mkdirSync(dirname(file.path), { recursive: true, mode: 0o700 });
  const temporary = `${file.path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ projects: file.projects }, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  renameSync(temporary, file.path);
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

/** A project URL as `config add` and `config update` accept it: HTTP(S) only, the SDK mangles any other scheme. */
export function parseProjectUrl(url: string): string {
  const parsed = URL.parse(url);
  if (parsed === null || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throw new MeiliCliError("cli_usage", `Invalid project URL \`${url}\`.`);
  }
  return url;
}

/** The `cloudId` of the named entry, or `cli_config` naming the ways to set it (config.md, "Cloud projects"). */
export function cloudIdOf(file: ConfigFile, name: string): number {
  const { cloudId } = projectOf(file, name);
  if (cloudId === undefined) {
    throw new MeiliCliError(
      "cli_config",
      `Project \`${name}\` has no \`cloudId\` in ${file.path}: the management commands need the project's id.`,
      {
        hint: `Run \`meili config sync-with-cloud\`, or \`meili config update --project ${name} --project-cloud-id <id>\`.`,
      },
    );
  }
  return cloudId;
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

// Management API credentials

export interface ManagementFlags {
  token?: string | undefined;
  url?: string | undefined;
}

export interface ManagementCredentials {
  token: string;
  url: string;
}

/**
 * The flags, then `MEILI_MANAGEMENT_TOKEN` and `MEILI_MANAGEMENT_URL`, with the
 * production URL by default. Fails before any network call when the token is missing.
 */
export function resolveManagementCredentials(
  flags: ManagementFlags,
  env: Env,
): ManagementCredentials {
  const token = flags.token ?? nonEmpty(env[ENV.MANAGEMENT_TOKEN]);
  if (token === undefined) {
    throw new MeiliCliError(
      "cli_auth_missing",
      "No Management API token configured. Provide one with the `--management-token` flag or the `MEILI_MANAGEMENT_TOKEN` environment variable.",
      { hint: "Create a personal access token in the Meilisearch Cloud dashboard." },
    );
  }
  return {
    token,
    url: flags.url ?? nonEmpty(env[ENV.MANAGEMENT_URL]) ?? DEFAULT_MANAGEMENT_URL,
  };
}

// Secrets

/** `****1a2b`: the last four characters only. Shorter values are fully masked. */
export function maskSecret(value: string): string {
  return value.length > 4 ? `****${value.slice(-4)}` : "****";
}

/** Body fields whose value is a secret, as listed in config.md. `masterKey` is a Cloud project's, in the Management API. */
export const REDACTED_FIELDS: ReadonlySet<string> = new Set([
  "apiKey",
  "apikey",
  "masterKey",
  "key",
  "token",
]);

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

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}
