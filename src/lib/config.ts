/**
 * Configuration contract: connection resolution, environment variables and
 * secret redaction. See docs/contract/config.md.
 *
 * This file, output.ts and errors.ts implement the contract. They change only
 * through a contract pull request.
 */
import { MeiliCliError } from "./errors.js";

export type Env = Readonly<Record<string, string | undefined>>;

/** Names of the environment variables the CLI reads. Nothing reads `process.env.MEILI_*` directly. */
export const ENV = {
  PROJECT_URL: "MEILI_PROJECT_URL",
  PROJECT_API_KEY: "MEILI_PROJECT_API_KEY",
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
  { name: ENV.MANAGEMENT_TOKEN, description: "Management API personal access token." },
  {
    name: ENV.MANAGEMENT_URL,
    description: `Management API base URL. Default ${DEFAULT_MANAGEMENT_URL}.`,
  },
  { name: ENV.OUTPUT, description: "Default output mode: json or ndjson.", flag: "output" },
  { name: ENV.TIMEOUT, description: "Default --timeout for --wait.", flag: "timeout" },
];

// Project connection

export interface ProjectFlags {
  url?: string | undefined;
  apiKey?: string | undefined;
}

export interface ProjectConnection {
  url: string;
  apiKey: string | undefined;
}

/**
 * Flags, then environment variables, field by field. Never falls back to
 * localhost. A missing key is not an error here: the API answers 401.
 */
export function resolveProjectConnection(flags: ProjectFlags, env: Env): ProjectConnection {
  const url = flags.url ?? nonEmpty(env[ENV.PROJECT_URL]);
  if (url === undefined) {
    throw new MeiliCliError(
      "cli_config",
      "No project URL configured. Provide one with the `--project-url` flag or the `MEILI_PROJECT_URL` environment variable.",
    );
  }
  return { url, apiKey: flags.apiKey ?? nonEmpty(env[ENV.PROJECT_API_KEY]) };
}

// Management API credentials

export interface ManagementCredentials {
  token: string;
  url: string;
}

/**
 * `MEILI_MANAGEMENT_TOKEN`, and `MEILI_MANAGEMENT_URL` with its default. Fails
 * before any network call when the token is missing. The `--management-token`
 * and `--management-url` flags arrive with the first management command.
 */
export function resolveManagementCredentials(env: Env): ManagementCredentials {
  const token = nonEmpty(env[ENV.MANAGEMENT_TOKEN]);
  if (token === undefined) {
    throw new MeiliCliError(
      "cli_auth_missing",
      "No Management API token configured. Set the `MEILI_MANAGEMENT_TOKEN` environment variable.",
      {
        hint: "Create a personal access token in the Meilisearch Cloud dashboard and set `MEILI_MANAGEMENT_TOKEN`.",
      },
    );
  }
  return { token, url: nonEmpty(env[ENV.MANAGEMENT_URL]) ?? DEFAULT_MANAGEMENT_URL };
}

// Secrets

/** `****1a2b`: the last four characters only. Shorter values are fully masked. */
export function maskSecret(value: string): string {
  return value.length > 4 ? `****${value.slice(-4)}` : "****";
}

/** Body fields whose value is a secret, as listed in config.md. `apikey` is the Management API's spelling. */
export const REDACTED_FIELDS: ReadonlySet<string> = new Set(["apiKey", "apikey", "key", "token"]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
