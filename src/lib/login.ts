/**
 * The browser login of `meili auth login`, which `meili teleport` runs too
 * when nobody is logged in. See ADR 0009.
 */
import { spawn } from "node:child_process";
import { identify } from "./analytics.js";
import { getApiV2Me } from "./clients/management/generated/sdk.gen.js";
import { createManagementClient } from "./clients/management.js";
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

/**
 * Runs the OAuth flow, writes the session to the credentials file, with the
 * Cloud user the usage events use from now on (ADR 0016), and returns both.
 * `say` writes a line for the human: an interactive command draws it in its margin.
 */
export async function logInWithBrowser(
  env: Env,
  browser: boolean,
  userAgent: string,
  say: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): Promise<{ path: string; session: Session }> {
  const client = resolveOauthClient(env);
  const tokens = await logIn(client, {
    timeoutMs: TIMEOUT_MS,
    onAuthorizationUrl: (url) => {
      say(`Approve the login for \`${SCOPES}\` at:`);
      say(url);
      if (browser) openInBrowser(url);
    },
  });
  const session: Session = { ...client, ...tokens };
  const userId = await identify(env, async () => {
    const management = createManagementClient({
      url: session.managementUrl,
      token: session.accessToken,
      userAgent,
    });
    return (await getApiV2Me({ client: management })).id;
  });
  if (userId !== undefined) session.userId = userId;
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
