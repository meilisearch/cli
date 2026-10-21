/**
 * The Management API session: the credentials file `meili auth login` writes,
 * the resolution order of `docs/contract/config.md`, and the refresh that keeps
 * an access token usable. See ADR 0009.
 *
 * It sits above `config.ts`, which stays a leaf, and below the commands.
 */
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { type OauthClient, type OauthSession, refreshAccessToken } from "./clients/oauth.js";
import {
  configFilePath,
  DEFAULT_MANAGEMENT_DASHBOARD_URL,
  DEFAULT_MANAGEMENT_URL,
  ENV,
  type Env,
  isRecord,
  nonEmpty,
  readOwnerOnly,
  writeSecretFile,
} from "./config.js";
import { MeiliCliError } from "./errors.js";

export interface ManagementCredentials {
  token: string;
  url: string;
}

/**
 * A token travels in the clear to anything but HTTPS, so only a loopback
 * address, where nothing leaves the machine, may be plain HTTP.
 */
function requireSecureUrl(url: string, what: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new MeiliCliError("cli_usage", `${what} is not a URL: ${url}`);
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.host.split(":")[0] ?? "");
  if (parsed.protocol !== "https:" && !loopback) {
    throw new MeiliCliError(
      "cli_usage",
      `${what} must be HTTPS, or a loopback address: ${url} would send the token in the clear.`,
    );
  }
}

export interface OauthFlags {
  clientId?: string | undefined;
  managementUrl?: string | undefined;
  dashboardUrl?: string | undefined;
}

/**
 * The OAuth application `auth login` identifies itself with: the flags, then
 * the environment, then the defaults. The client id has no default, it is the
 * application registered for this CLI on that Cloud.
 */
export function resolveOauthClient(flags: OauthFlags, env: Env): OauthClient {
  const clientId = nonEmpty(flags.clientId) ?? nonEmpty(env[ENV.MANAGEMENT_CLIENT_ID]);
  if (clientId === undefined) {
    throw new MeiliCliError(
      "cli_usage",
      "No OAuth application. Pass `--management-client-id` or set the `MEILI_MANAGEMENT_CLIENT_ID` environment variable.",
      {
        hint: "The `uid` of a public OAuth application registered on that Cloud, with `http://127.0.0.1/callback` as its redirect URI.",
      },
    );
  }
  // The two URLs name the same Cloud: one alone would send the human to the consent
  // page of a Cloud and the code to the token endpoint of another.
  const managementUrl = nonEmpty(flags.managementUrl) ?? nonEmpty(env[ENV.MANAGEMENT_URL]);
  const dashboardUrl = nonEmpty(flags.dashboardUrl) ?? nonEmpty(env[ENV.MANAGEMENT_DASHBOARD_URL]);
  if ((managementUrl === undefined) !== (dashboardUrl === undefined)) {
    throw new MeiliCliError(
      "cli_usage",
      "A Cloud is named by both of its URLs. Give `--management-url` and `--management-dashboard-url` together, or neither to use Meilisearch Cloud.",
    );
  }
  const client = {
    clientId,
    managementUrl: managementUrl ?? DEFAULT_MANAGEMENT_URL,
    dashboardUrl: dashboardUrl ?? DEFAULT_MANAGEMENT_DASHBOARD_URL,
  };
  requireSecureUrl(client.managementUrl, "--management-url");
  requireSecureUrl(client.dashboardUrl, "--management-dashboard-url");
  return client;
}

/** The session `auth login` writes, and `auth logout` revokes and removes. */
export interface Session extends OauthSession {
  /** When the access token stops being accepted, ISO 8601. */
  expiresAt: string;
  scope: string;
}

/** `credentials.json`, next to the config file: `MEILI_CONFIG` moves both. */
export function credentialsFilePath(env: Env): string {
  return join(dirname(configFilePath(env)), "credentials.json");
}

/** The session of `auth login`, undefined when nobody logged in. */
export function readCredentialsFile(
  path: string,
  warn: (warning: MeiliCliError) => void,
): Session | undefined {
  const text = readOwnerOnly(path, "credentials", warn);
  if (text === undefined) return undefined;
  const malformed = (): MeiliCliError =>
    new MeiliCliError(
      `cli_config`,
      `The credentials file ${path} is not a session of \`meili auth login\`.`,
      { hint: "Run `meili auth login` to write it again." },
    );

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw malformed();
  }
  const fields = ["clientId", "managementUrl", "dashboardUrl", "accessToken", "expiresAt", "scope"];
  if (!isRecord(parsed) || !fields.every((field) => typeof parsed[field] === "string")) {
    throw malformed();
  }
  if (parsed.refreshToken !== undefined && typeof parsed.refreshToken !== "string") {
    throw malformed();
  }
  const session = parsed as unknown as Session;
  requireSecureUrl(session.managementUrl, `the \`managementUrl\` of ${path}`);
  return session;
}

/** Writes the session owner-only and atomically, like the config file. */
export function writeCredentialsFile(path: string, session: Session): void {
  writeSecretFile(path, session);
}

/** Forgets the session. Does nothing when there is none. */
export function removeCredentialsFile(path: string): void {
  rmSync(path, { force: true });
}

/** A token with less than this left is refreshed before the command runs. */
const EXPIRY_MARGIN_MS = 30_000;

/**
 * `MEILI_MANAGEMENT_TOKEN`, then the session of `auth login`, with
 * `MEILI_MANAGEMENT_URL` and its default. Fails before any network call when
 * neither exists. An access token that is about to expire is refreshed here,
 * and the new one is written back. The `--management-token` and
 * `--management-url` flags arrive with the first management command.
 */
export async function resolveManagementCredentials(
  env: Env,
  warn: (warning: MeiliCliError) => void,
): Promise<ManagementCredentials> {
  const chosen = nonEmpty(env[ENV.MANAGEMENT_URL]);
  const token = nonEmpty(env[ENV.MANAGEMENT_TOKEN]);
  if (token !== undefined) return { token, url: chosen ?? DEFAULT_MANAGEMENT_URL };

  const path = credentialsFilePath(env);
  const session = readCredentialsFile(path, warn);
  if (session === undefined) {
    throw new MeiliCliError(
      "cli_auth_missing",
      "No Management API credentials. Run `meili auth login`, or set the `MEILI_MANAGEMENT_TOKEN` environment variable.",
      { hint: "Run `meili auth login` to log in with a browser." },
    );
  }
  if (chosen !== undefined && chosen !== session.managementUrl) {
    throw new MeiliCliError(
      "cli_config",
      `The session of \`meili auth login\` was issued by ${session.managementUrl}, but \`${ENV.MANAGEMENT_URL}\` points at ${chosen}. A token is never sent to another Cloud.`,
      { hint: "Run `meili auth login` against that URL, or unset the variable." },
    );
  }
  const fresh = await ensureFreshSession(path, session);
  return { token: fresh.accessToken, url: fresh.managementUrl };
}

/**
 * The session, with a new access token when the stored one is spent. Writes the
 * new pair back, so the next command finds it fresh.
 */
/**
 * Trades the refresh token for a new pair and writes it back, so the next
 * command finds it fresh. A server that answers without a new refresh token
 * keeps the one we have, rather than losing the session (RFC 6749, section 6).
 */
export async function refreshSession(path: string, session: Session): Promise<Session> {
  if (session.refreshToken === undefined) {
    throw new MeiliCliError("cli_auth_failed", "The session carries no refresh token.", {
      hint: "Run `meili auth login` to log in again.",
    });
  }
  const tokens = await refreshAccessToken(session, session.refreshToken);
  const refreshed: Session = {
    ...session,
    ...tokens,
    refreshToken: tokens.refreshToken ?? session.refreshToken,
  };
  writeCredentialsFile(path, refreshed);
  return refreshed;
}

/** The session, refreshed only when its access token is spent. */
export function ensureFreshSession(path: string, session: Session): Promise<Session> {
  if (Date.parse(session.expiresAt) - Date.now() > EXPIRY_MARGIN_MS)
    return Promise.resolve(session);
  return refreshSession(path, session);
}
