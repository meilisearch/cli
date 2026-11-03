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
import { isRecord, MeiliCliError } from "./errors.js";

export type Env = Readonly<Record<string, string | undefined>>;

/** Names of the environment variables the CLI reads. Nothing reads `process.env.MEILI_*` directly. */
export const ENV = {
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
    name: ENV.CONFIG,
    description:
      "Config file path. Default ~/.config/meili/config.json. Give each agent its own file, read-only.",
  },
  {
    name: ENV.MANAGEMENT_TOKEN,
    description:
      "Management API token, in place of the session of `auth login`. For development and tests.",
  },
  {
    name: ENV.MANAGEMENT_URL,
    description: `Management API base URL. Default ${DEFAULT_MANAGEMENT_URL}. For development and tests.`,
  },
  {
    name: ENV.MANAGEMENT_CLIENT_ID,
    description:
      "OAuth application the `auth login` command identifies itself with. Default: the one of this CLI on Meilisearch Cloud. For development and tests.",
  },
  {
    name: ENV.MANAGEMENT_DASHBOARD_URL,
    description: `Dashboard URL, which hosts the consent page of \`auth login\`. Default ${DEFAULT_MANAGEMENT_DASHBOARD_URL}. For development and tests.`,
  },
  { name: ENV.OUTPUT, description: "Default output mode: json or ndjson.", flag: "output" },
  { name: ENV.TIMEOUT, description: "Default --timeout for --wait.", flag: "timeout" },
];

// Config file

export interface ProjectEntry {
  url: string;
  apiKey?: string;
  /** The project in Meilisearch Cloud, written from the Management API (ADR 0011). */
  cloud?: CloudIdentifiers;
}

/** `id` names the project on the management commands; the team is for the reader of the file. */
export interface CloudIdentifiers {
  id: number;
  teamId?: number;
  teamName?: string;
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
      `The config file ${path} must be {"projects": {"<name>": {"url": "...", "apiKey": "...", "cloud": {"id": 1, "teamId": 2, "teamName": "..."}}}}, the key and cloud optional, and in cloud the team.`,
    );
  const projects = isRecord(parsed) ? parsed.projects : undefined;
  if (!isRecord(projects)) throw shape();
  const result: Record<string, ProjectEntry> = {};
  for (const [name, entry] of Object.entries(projects)) {
    if (!isRecord(entry) || typeof entry.url !== "string") throw shape();
    if (entry.apiKey !== undefined && typeof entry.apiKey !== "string") throw shape();
    const { cloud } = entry;
    if (
      cloud !== undefined &&
      (!isRecord(cloud) ||
        !Number.isInteger(cloud.id) ||
        (cloud.teamId !== undefined && !Number.isInteger(cloud.teamId)) ||
        (cloud.teamName !== undefined && typeof cloud.teamName !== "string"))
    ) {
      throw shape();
    }
    result[name] = {
      url: entry.url,
      ...(entry.apiKey === undefined ? {} : { apiKey: entry.apiKey }),
      ...(cloud === undefined
        ? {}
        : {
            cloud: {
              id: cloud.id as number,
              ...(cloud.teamId === undefined ? {} : { teamId: cloud.teamId as number }),
              ...(cloud.teamName === undefined ? {} : { teamName: cloud.teamName as string }),
            },
          }),
    };
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
 * The rules of docs/contract/config.md, "Resolution: the command line names
 * the project". The file is read only for `--project`; nothing else is read.
 * Never falls back to localhost.
 */
export function resolveProjectConnection(
  flags: ProjectFlags,
  readFile: () => ConfigFile,
): ProjectConnection {
  if (flags.url !== undefined) {
    if (flags.project !== undefined) {
      throw new MeiliCliError(
        "cli_usage",
        "`--project` cannot be combined with `--project-url`: the name and the URL contradict each other.",
      );
    }
    assertProjectUrl(flags.url);
    return { url: flags.url, apiKey: flags.apiKey };
  }
  if (flags.project !== undefined) {
    const entry = projectOf(readFile(), flags.project);
    return { url: entry.url, apiKey: flags.apiKey ?? entry.apiKey };
  }
  throw new MeiliCliError(
    "cli_usage",
    "Name the project with `--project <name>`, an entry of the config file, or with `--project-url <url>`.",
    { hint: "Run `meili config list` to see the projects of the config file." },
  );
}

/**
 * The Cloud project a management command acts on (config.md, "Cloud projects"):
 * `--id` as given, or the `cloud.id` of the entry named by `--project`. Both
 * together contradict each other; neither is a usage error.
 */
export function resolveCloudProjectId(
  flags: { id?: number | undefined; project?: string | undefined },
  readFile: () => ConfigFile,
): number {
  if (flags.project !== undefined && flags.id !== undefined) {
    throw new MeiliCliError(
      "cli_usage",
      "`--project` cannot be combined with `--id`: the name and the id contradict each other.",
    );
  }
  if (flags.project === undefined) {
    if (flags.id === undefined) {
      throw new MeiliCliError(
        "cli_usage",
        "Name the project with `--id <id>` or `--project <name>`.",
      );
    }
    return flags.id;
  }
  const file = readFile();
  const { cloud } = projectOf(file, flags.project);
  if (cloud === undefined) {
    throw new MeiliCliError(
      "cli_config",
      `Project \`${flags.project}\` has no cloud identifiers in ${file.path}: the management commands need the project's id.`,
      { hint: `Run \`meili config update --project ${flags.project} --sync-with-cloud\`.` },
    );
  }
  return cloud.id;
}

/** `cli_config` when the file already has an entry named `name`; `detail` follows the path. */
export function assertNoProject(file: ConfigFile, name: string, detail: string): void {
  if (file.projects[name] !== undefined) {
    throw new MeiliCliError(
      "cli_config",
      `Project \`${name}\` already exists in ${file.path}${detail}`,
      {
        hint: `Run \`meili config update --project ${name}\` to change it, or \`meili config unset --project ${name}\` first.`,
      },
    );
  }
}

/**
 * The entry `--sync-config` changes for the Cloud project `id`: the one
 * `--project` names, else the one whose `cloud.id` is `id`. None, or several,
 * is `cli_config` before any call; `detail` follows the path.
 */
export function cloudProjectEntry(
  file: ConfigFile,
  project: string | undefined,
  id: number,
  detail: string,
): string {
  if (project !== undefined) return project;
  const names = entriesOfCloudId(file, id);
  const [name] = names;
  if (name !== undefined && names.length === 1) return name;
  throw new MeiliCliError(
    "cli_config",
    names.length === 0
      ? `No project of ${file.path} has the cloud id ${id}${detail}`
      : `Projects ${names.map((each) => `\`${each}\``).join(", ")} of ${file.path} have the cloud id ${id}${detail}`,
    {
      hint:
        names.length === 0
          ? `Run \`meili config sync-with-cloud --project-url <url>\` first, with the project's URL.`
          : "Name one with `--project` in place of `--id`.",
    },
  );
}

/** The names of the entries whose `cloud.id` is `id`. */
export function entriesOfCloudId(file: ConfigFile, id: number): string[] {
  return Object.keys(file.projects).filter((name) => file.projects[name]?.cloud?.id === id);
}

/** `cli_usage` unless `value` is an HTTP(S) URL: a Meilisearch instance answers over nothing else. */
export function assertProjectUrl(value: string): void {
  const url = URL.parse(value);
  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new MeiliCliError("cli_usage", `Invalid project URL \`${value}\`.`);
  }
}

/** In the help of every command that writes the config file (config.md, "Config file"). */
export const CONFIG_FILE_WARNING =
  "The file holds API keys and decides where every later command goes, for every process that reads it: an agent runs this only when the human asked for it explicitly.";

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

/**
 * Body fields whose value is a secret, as listed in config.md. `apikey` is the
 * Management API's spelling, `masterKey` a Cloud project's key in the same API.
 */
export const REDACTED_FIELDS: ReadonlySet<string> = new Set([
  "apiKey",
  "apikey",
  "masterKey",
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
