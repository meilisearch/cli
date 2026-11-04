/**
 * The browser login of `meili auth login`, which `meili teleport` runs too
 * when nobody is logged in. See ADR 0009.
 */
import { spawn } from "node:child_process";
import { logIn, SCOPES } from "./clients/oauth.js";
import type { Env } from "./config.js";
import {
  credentialsFilePath,
  resolveOauthClient,
  type Session,
  writeCredentialsFile,
} from "./session.js";

/** How long the human has to approve before the login gives up. */
const TIMEOUT_MS = 300_000;

/** Runs the OAuth flow, writes the session to the credentials file, and returns both. */
export async function logInWithBrowser(
  env: Env,
  browser: boolean,
): Promise<{ path: string; session: Session }> {
  const client = resolveOauthClient(env);
  const tokens = await logIn(client, {
    timeoutMs: TIMEOUT_MS,
    onAuthorizationUrl: (url) => {
      process.stderr.write(`Approve the login for \`${SCOPES}\` at:\n${url}\n`);
      if (browser) openInBrowser(url);
    },
  });
  const session: Session = { ...client, ...tokens };
  const path = credentialsFilePath(env);
  writeCredentialsFile(path, session);
  return { path, session };
}

/** Hands the URL to the desktop. A failure is not one: the URL is on stderr. */
function openInBrowser(url: string): void {
  // An argument array and no shell, on every platform: a consent URL always
  // carries `&`, which `cmd` would read as a command separator.
  const [command, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}
