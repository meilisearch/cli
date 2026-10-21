import { describe, expect, it } from "vitest";
import AuthStatus from "../../../src/commands/auth/status.js";
import { startAuthorizationServer } from "../../helpers/oauth-server.js";
import { runCli, runCommand } from "../../helpers/run-command.js";
import { sessionHome, storeSession } from "../../helpers/session.js";

describe("meili auth status", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["auth", "status", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("asks the authorization server and answers on stdout when it still accepts", async () => {
    const server = await startAuthorizationServer();
    const env = sessionHome();
    const path = storeSession(env, server.url, { accessToken: "access-token-live" });
    server.accept("access-token-live");
    try {
      const result = await runCommand(AuthStatus, ["--output", "json"], { env });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        managementUrl: server.url,
        scope: "read write",
        expiresAt: expect.any(String),
        credentials: path,
      });
    } finally {
      await server.close();
    }
  });

  it("answers with the error alone when nobody is logged in", async () => {
    const result = await runCommand(AuthStatus, ["--output", "json"], { env: sessionHome() });
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_auth_missing");
  });

  it("answers with the error alone when the server no longer accepts the token", async () => {
    const server = await startAuthorizationServer();
    const env = sessionHome();
    storeSession(env, server.url, { accessToken: "access-token-revoked" });
    try {
      const result = await runCommand(AuthStatus, ["--output", "json"], { env });
      expect(result.exitCode).toBe(3);
      expect(result.stdout).toBe("");
      const { error } = JSON.parse(result.stderr) as { error: { code: string; hint: string } };
      expect(error.code).toBe("cli_auth_failed");
      expect(error.hint).toContain("meili auth login");
    } finally {
      await server.close();
    }
  });
});
