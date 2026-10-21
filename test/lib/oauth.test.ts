import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  logIn,
  type OauthClient,
  refreshAccessToken,
  revokeSession,
} from "../../src/lib/clients/oauth.js";
import {
  type AuthorizationServer,
  STUB_CLIENT_ID,
  startAuthorizationServer,
} from "../helpers/oauth-server.js";

let server: AuthorizationServer;
let client: OauthClient;

beforeEach(async () => {
  server = await startAuthorizationServer();
  client = { dashboardUrl: server.url, managementUrl: server.url, clientId: STUB_CLIENT_ID };
});

afterEach(async () => {
  await server.close();
});

/** Plays the browser: opens the consent URL and follows the redirect to the loopback server. */
function approve(url: string): void {
  void fetch(url, { redirect: "follow" }).catch(() => {});
}

describe("logIn", () => {
  it("asks for a code with PKCE on a loopback redirect, and exchanges it", async () => {
    const tokens = await logIn(client, { timeoutMs: 5000, onAuthorizationUrl: approve });

    expect(tokens.accessToken).toMatch(/^access-token-/);
    expect(tokens.refreshToken).toMatch(/^refresh-token-/);
    expect(tokens.scope).toBe("read write");
    expect(Date.parse(tokens.expiresAt)).toBeGreaterThan(Date.now());

    const asked = server.authorization;
    expect(asked?.get("response_type")).toBe("code");
    expect(asked?.get("code_challenge_method")).toBe("S256");
    expect(asked?.get("scope")).toBe("read write");
    expect(asked?.get("client_id")).toBe(STUB_CLIENT_ID);
    expect(asked?.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(asked?.get("state")?.length).toBeGreaterThan(8);
  });

  it("ignores a callback that carries another state, and waits until it times out", async () => {
    // Nothing on the machine can end a login it did not start.
    await expect(
      logIn(client, {
        timeoutMs: 200,
        onAuthorizationUrl: (url) => {
          const forged = new URL(new URL(url).searchParams.get("redirect_uri") ?? "");
          forged.searchParams.set("code", "stolen");
          forged.searchParams.set("state", "someone-else");
          approve(forged.href);
        },
      }),
    ).rejects.toMatchObject({ code: "cli_timeout", exitCode: 5 });
  });

  it("passes the refusal of the authorization server through", async () => {
    await expect(
      logIn(client, {
        timeoutMs: 5000,
        onAuthorizationUrl: (url) => {
          const asked = new URL(url).searchParams;
          const back = new URL(asked.get("redirect_uri") ?? "");
          back.searchParams.set("state", asked.get("state") ?? "");
          back.searchParams.set("error", "access_denied");
          back.searchParams.set("error_description", "The user refused");
          approve(back.href);
        },
      }),
    ).rejects.toMatchObject({
      code: "cli_auth_failed",
      exitCode: 3,
      message: expect.stringContaining("The user refused"),
    });
  });
});

describe("refreshAccessToken", () => {
  it("trades the refresh token for a new pair", async () => {
    const first = await logIn(client, { timeoutMs: 5000, onAuthorizationUrl: approve });
    const second = await refreshAccessToken(client, first.refreshToken ?? "");

    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(Date.parse(second.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("fails with cli_auth_failed on a refresh token the server does not know", async () => {
    await expect(refreshAccessToken(client, "stale")).rejects.toMatchObject({
      code: "cli_auth_failed",
      message: expect.stringContaining("unknown refresh token"),
      hint: expect.stringContaining("meili auth login"),
    });
  });
});

describe("revokeSession", () => {
  it("revokes the refresh token then the access token, each with its hint", async () => {
    await revokeSession({
      ...client,
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
    });
    expect(server.revoked).toEqual(["refresh-token-1", "access-token-1"]);
    expect(server.hints).toEqual(["refresh_token", "access_token"]);
  });

  it("throws cli_auth_failed when the server refuses, exit 3", async () => {
    server.refuseRevocation = true;
    await expect(revokeSession({ ...client, accessToken: "access-token-1" })).rejects.toMatchObject(
      {
        code: "cli_auth_failed",
        exitCode: 3,
      },
    );
    expect(server.revoked).toEqual([]);
  });

  it("throws cli_network when the authorization server is gone, exit 6", async () => {
    await server.close();
    await expect(revokeSession({ ...client, accessToken: "access-token-1" })).rejects.toMatchObject(
      {
        code: "cli_network",
        exitCode: 6,
        message: expect.stringContaining("Cannot reach"),
      },
    );
  });
});
