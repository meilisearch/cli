import { describe, expect, it } from "vitest";
import AuthLogin from "../../../src/commands/auth/login.js";
import {
  credentialsFilePath,
  readCredentialsFile,
  type Session,
} from "../../../src/lib/session.js";
import {
  type AuthorizationServer,
  STUB_CLIENT_ID,
  startAuthorizationServer,
} from "../../helpers/oauth-server.js";
import { runCli, runCommand } from "../../helpers/run-command.js";
import { sessionHome } from "../../helpers/session.js";

function argv(server: AuthorizationServer): string[] {
  return [
    "--management-client-id",
    STUB_CLIENT_ID,
    "--management-url",
    server.url,
    "--management-dashboard-url",
    server.url,
    "--no-browser",
  ];
}

/**
 * Plays the browser, once: the command prints the consent URL on stderr and the
 * test opens it. Only that URL, and only the first time, because with `--debug`
 * stderr also carries the trace of the requests this opening causes.
 */
function browser(): (chunk: string) => void {
  let opened = false;
  return (chunk) => {
    const url = chunk.match(/https?:\/\/\S+\/oauth\/authorize\S*/)?.[0];
    if (opened || url === undefined) return;
    opened = true;
    void fetch(url, { redirect: "follow" }).catch(() => {});
  };
}

describe("meili auth login", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["auth", "login", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("logs in with a browser and writes the session, with no token on any stream", async () => {
    const server = await startAuthorizationServer();
    const env = sessionHome();
    try {
      const result = await runCommand(AuthLogin, [...argv(server), "--output", "json"], {
        env,
        onStderr: browser(),
      });
      expect(result.exitCode).toBe(0);
      // The session is the data, and it went to the file.
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`${server.url}/oauth/authorize`);

      const session = readCredentialsFile(credentialsFilePath(env), () => {}) as Session;
      expect(session.accessToken).toMatch(/^access-token-/);
      expect(session.refreshToken).toMatch(/^refresh-token-/);
      expect(session.clientId).toBe(STUB_CLIENT_ID);
      expect(session.managementUrl).toBe(server.url);
      expect(result.stderr).not.toContain(session.accessToken);
      expect(result.stderr).not.toContain(session.refreshToken ?? "never");
    } finally {
      await server.close();
    }
  });

  it("takes the application from the environment when the flag is absent", async () => {
    const server = await startAuthorizationServer();
    const env = {
      ...sessionHome(),
      MEILI_MANAGEMENT_CLIENT_ID: STUB_CLIENT_ID,
      MEILI_MANAGEMENT_URL: server.url,
      MEILI_MANAGEMENT_DASHBOARD_URL: server.url,
    };
    try {
      const result = await runCommand(AuthLogin, ["--no-browser"], { env, onStderr: browser() });
      expect(result.exitCode).toBe(0);
      expect(server.authorization?.get("client_id")).toBe(STUB_CLIENT_ID);
    } finally {
      await server.close();
    }
  });

  it("refuses one URL without the other: a Cloud is named by both", async () => {
    const result = await runCommand(
      AuthLogin,
      ["--management-client-id", STUB_CLIENT_ID, "--management-url", "https://api.example.com"],
      { env: sessionHome() },
    );
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
    expect(JSON.parse(result.stderr).error.message).toContain("together");
  });

  it("refuses to start without an application, before any network call", async () => {
    const result = await runCommand(AuthLogin, ["--no-browser"], { env: sessionHome() });
    expect(result).toMatchSnapshot();
  });

  // Last: the trace wraps fetch for the rest of the process.
  it("masks the tokens of the exchange in the --debug trace", async () => {
    const server = await startAuthorizationServer();
    const env = sessionHome();
    try {
      const result = await runCommand(AuthLogin, [...argv(server), "--debug"], {
        env,
        onStderr: browser(),
      });
      expect(result.exitCode).toBe(0);
      const session = readCredentialsFile(credentialsFilePath(env), () => {}) as Session;
      expect(result.stderr).toContain(`> POST ${server.url}/oauth/token`);
      expect(result.stderr).toContain('"access_token":"****');
      expect(result.stderr).toContain('"refresh_token":"****');
      expect(result.stderr).not.toContain(session.accessToken);
    } finally {
      await server.close();
    }
  });
});
