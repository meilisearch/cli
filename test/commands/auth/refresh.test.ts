import { describe, expect, it } from "vitest";
import AuthRefresh from "../../../src/commands/auth/refresh.js";
import { readCredentialsFile, type Session } from "../../../src/lib/session.js";
import { STUB_CLIENT_ID, startAuthorizationServer } from "../../helpers/oauth-server.js";
import { runCli, runCommand } from "../../helpers/run-command.js";
import { sessionHome, storeSession } from "../../helpers/session.js";

describe("meili auth refresh", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["auth", "refresh", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("trades the refresh token for a new pair and writes it back", async () => {
    const server = await startAuthorizationServer();
    const env = sessionHome();
    const path = storeSession(env, server.url);
    server.accept("refresh-token-seed");
    try {
      const result = await runCommand(AuthRefresh, [], { env });
      expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });

      const session = readCredentialsFile(path, () => {}) as Session;
      expect(session.accessToken).not.toBe("access-token-seed");
      expect(session.refreshToken).not.toBe("refresh-token-seed");
      expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now());
      // Everything else of the session is kept.
      expect(session.clientId).toBe(STUB_CLIENT_ID);
      expect(session.managementUrl).toBe(server.url);
    } finally {
      await server.close();
    }
  });

  it("refuses when nobody is logged in", async () => {
    const result = await runCommand(AuthRefresh, [], { env: sessionHome() });
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_auth_missing");
  });

  it("refuses a session that carries no refresh token", async () => {
    const server = await startAuthorizationServer();
    const env = sessionHome();
    storeSession(env, server.url, { refreshToken: undefined });
    try {
      const result = await runCommand(AuthRefresh, [], { env });
      expect(result.exitCode).toBe(3);
      const { error } = JSON.parse(result.stderr) as { error: { code: string; hint: string } };
      expect(error.code).toBe("cli_auth_failed");
      expect(error.hint).toContain("meili auth login");
    } finally {
      await server.close();
    }
  });

  it("passes the refusal of the authorization server through", async () => {
    const server = await startAuthorizationServer();
    const env = sessionHome();
    storeSession(env, server.url, { refreshToken: "stale" });
    try {
      const result = await runCommand(AuthRefresh, [], { env });
      expect(result.exitCode).toBe(3);
      expect(JSON.parse(result.stderr).error.code).toBe("cli_auth_failed");
      expect(JSON.parse(result.stderr).error.message).toContain("unknown refresh token");
    } finally {
      await server.close();
    }
  });
});
