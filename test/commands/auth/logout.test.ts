import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import AuthLogout from "../../../src/commands/auth/logout.js";
import { startAuthorizationServer } from "../../helpers/oauth-server.js";
import { runCli, runCommand } from "../../helpers/run-command.js";
import { sessionHome, storeSession } from "../../helpers/session.js";

describe("meili auth logout", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["auth", "logout", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("revokes both tokens and removes the credentials file", async () => {
    const server = await startAuthorizationServer();
    const env = sessionHome();
    const path = storeSession(env, server.url, {
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
    });
    try {
      const result = await runCommand(AuthLogout, [], { env });
      expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
      expect(server.revoked).toEqual(["refresh-token-1", "access-token-1"]);
      expect(server.hints).toEqual(["refresh_token", "access_token"]);
      expect(existsSync(path)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("does nothing and exits 0 when nobody is logged in", async () => {
    const result = await runCommand(AuthLogout, [], { env: sessionHome() });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("forgets the session when the server refuses, and says the token is still live", async () => {
    const server = await startAuthorizationServer();
    server.refuseRevocation = true;
    const env = sessionHome();
    const path = storeSession(env, server.url);
    try {
      const result = await runCommand(AuthLogout, [], { env });
      expect(result.exitCode).toBe(3);
      expect(result.stdout).toBe("");
      expect(existsSync(path)).toBe(false);
      const { error } = JSON.parse(result.stderr) as { error: { code: string; message: string } };
      expect(error.code).toBe("cli_auth_failed");
      expect(error.message).toContain("stays valid until it expires");
    } finally {
      await server.close();
    }
  });
});
