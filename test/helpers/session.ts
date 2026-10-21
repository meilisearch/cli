/** The credentials file of `meili auth login`, as a test needs it. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { credentialsFilePath, type Session, writeCredentialsFile } from "../../src/lib/session.js";
import { STUB_CLIENT_ID } from "./oauth-server.js";

/** A `MEILI_CONFIG` of its own, so two tests never share a credentials file. */
export function sessionHome(): Record<string, string> {
  return { MEILI_CONFIG: join(mkdtempSync(join(tmpdir(), "meili-session-")), "config.json") };
}

/** The session `auth login` would have written against `url`. */
export function makeSession(url: string, overrides: Partial<Session> = {}): Session {
  return {
    clientId: STUB_CLIENT_ID,
    managementUrl: url,
    dashboardUrl: url,
    accessToken: "access-token-seed",
    refreshToken: "refresh-token-seed",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    scope: "read write",
    ...overrides,
  };
}

/** Writes that session where `env` points, and returns the path it went to. */
export function storeSession(
  env: Record<string, string>,
  url: string,
  overrides: Partial<Session> = {},
): string {
  const path = credentialsFilePath(env);
  writeCredentialsFile(path, makeSession(url, overrides));
  return path;
}
