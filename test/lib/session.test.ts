/** The credentials file, the resolution order and the refresh of ADR 0009. */
import { chmodSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANAGEMENT_CLIENT_ID,
  DEFAULT_MANAGEMENT_DASHBOARD_URL,
  DEFAULT_MANAGEMENT_URL,
} from "../../src/lib/config.js";
import type { MeiliCliError } from "../../src/lib/errors.js";
import {
  credentialsFilePath,
  readCredentialsFile,
  removeCredentialsFile,
  resolveManagementCredentials,
  resolveOauthClient,
  writeCredentialsFile,
} from "../../src/lib/session.js";
import { makeSession, sessionHome, storeSession } from "../helpers/session.js";

/** A read that must not warn: an unexpected warning fails the test. */
const noWarning = (warning: MeiliCliError): never => {
  throw warning;
};

const URL = "https://mgmt.test";

describe("the credentials file", () => {
  it("sits next to the config file, so MEILI_CONFIG moves both", () => {
    expect(credentialsFilePath({ MEILI_CONFIG: "/tmp/agent/config.json" })).toBe(
      "/tmp/agent/credentials.json",
    );
  });

  it("is written owner-only and read back as it was written", () => {
    const env = sessionHome();
    const path = credentialsFilePath(env);
    const written = makeSession(URL);
    writeCredentialsFile(path, written);

    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readCredentialsFile(path, noWarning)).toEqual(written);
  });

  it("is undefined when nobody logged in, and warns when others can read it", () => {
    const env = sessionHome();
    const path = credentialsFilePath(env);
    expect(readCredentialsFile(path, noWarning)).toBeUndefined();

    writeCredentialsFile(path, makeSession(URL));
    chmodSync(path, 0o644);
    const warnings: MeiliCliError[] = [];
    expect(readCredentialsFile(path, (warning) => warnings.push(warning))).toBeDefined();
    expect(warnings[0]?.code).toBe("cli_config");
    expect(warnings[0]?.message).toContain("readable by others");
  });

  it("refuses a file that is not a session, and says how to write it again", () => {
    const env = sessionHome();
    const path = storeSession(env, URL);
    writeCredentialsFile(path, { accessToken: "lonely" } as never);
    try {
      readCredentialsFile(path, noWarning);
      expect.unreachable();
    } catch (error) {
      expect((error as MeiliCliError).code).toBe("cli_config");
      expect((error as MeiliCliError).hint).toContain("meili auth login");
    }
  });

  it("is removed by the logout path, twice without failing", () => {
    const env = sessionHome();
    const path = storeSession(env, URL);
    removeCredentialsFile(path);
    removeCredentialsFile(path);
    expect(existsSync(path)).toBe(false);
  });
});

describe("resolveOauthClient", () => {
  const client = { clientId: "uid" };

  it("logs in to Meilisearch Cloud, with the application of this CLI, when given nothing", () => {
    expect(resolveOauthClient({}, {})).toEqual({
      clientId: DEFAULT_MANAGEMENT_CLIENT_ID,
      managementUrl: DEFAULT_MANAGEMENT_URL,
      dashboardUrl: DEFAULT_MANAGEMENT_DASHBOARD_URL,
    });
  });

  it("still takes it when Meilisearch Cloud is the one named, URLs and all", () => {
    expect(
      resolveOauthClient(
        { managementUrl: DEFAULT_MANAGEMENT_URL, dashboardUrl: DEFAULT_MANAGEMENT_DASHBOARD_URL },
        {},
      ),
    ).toMatchObject({ clientId: DEFAULT_MANAGEMENT_CLIENT_ID });
  });

  it("asks another Cloud for its own application: the built-in one is not registered there", () => {
    expect(() =>
      resolveOauthClient(
        { managementUrl: "https://api.example.com", dashboardUrl: "https://cloud.example.com" },
        {},
      ),
    ).toThrowError(/No OAuth application/);
  });

  it("takes a loopback address in plain HTTP, including IPv6", () => {
    for (const url of ["http://localhost:3000", "http://127.0.0.1:8888", "http://[::1]:8888"]) {
      expect(
        resolveOauthClient({ ...client, managementUrl: url, dashboardUrl: url }, {}),
      ).toMatchObject({ managementUrl: url });
    }
  });

  it("refuses plain HTTP anywhere else, which would send the token in the clear", () => {
    expect(() =>
      resolveOauthClient(
        {
          ...client,
          managementUrl: "http://api.example.com",
          dashboardUrl: "http://api.example.com",
        },
        {},
      ),
    ).toThrowError(/HTTPS/);
  });

  it("refuses one URL without the other: a Cloud is named by both", () => {
    expect(() =>
      resolveOauthClient({ ...client, managementUrl: "https://api.example.com" }, {}),
    ).toThrowError(/together/);
  });
});

describe("resolveManagementCredentials", () => {
  const empty = { MEILI_CONFIG: join("/nowhere", "config.json") };

  it("reads the token and the URL, with the production URL by default", async () => {
    await expect(
      resolveManagementCredentials({ ...empty, MEILI_MANAGEMENT_TOKEN: "envToken" }, noWarning),
    ).resolves.toEqual({ token: "envToken", url: DEFAULT_MANAGEMENT_URL });
    await expect(
      resolveManagementCredentials(
        { ...empty, MEILI_MANAGEMENT_TOKEN: "envToken", MEILI_MANAGEMENT_URL: URL },
        noWarning,
      ),
    ).resolves.toEqual({ token: "envToken", url: URL });
  });

  it("fails before any network call with cli_auth_missing and exit 3", async () => {
    await expect(resolveManagementCredentials(empty, noWarning)).rejects.toMatchObject({
      code: "cli_auth_missing",
      exitCode: 3,
      message: expect.stringContaining("meili auth login"),
    });
  });

  it("falls back to the session of `auth login`, and the environment wins over it", async () => {
    const env = sessionHome();
    storeSession(env, URL, { accessToken: "fromFile" });

    await expect(resolveManagementCredentials(env, noWarning)).resolves.toEqual({
      token: "fromFile",
      url: URL,
    });
    await expect(
      resolveManagementCredentials({ ...env, MEILI_MANAGEMENT_TOKEN: "envToken" }, noWarning),
    ).resolves.toEqual({ token: "envToken", url: DEFAULT_MANAGEMENT_URL });
  });

  it("refuses to send a session to a Cloud that did not issue it", async () => {
    const env = sessionHome();
    storeSession(env, URL);
    await expect(
      resolveManagementCredentials(
        { ...env, MEILI_MANAGEMENT_URL: "https://other.test" },
        noWarning,
      ),
    ).rejects.toMatchObject({ code: "cli_config", exitCode: 2 });
  });

  it("refuses an expired session that carries no refresh token", async () => {
    const env = sessionHome();
    storeSession(env, URL, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      refreshToken: undefined,
    });
    await expect(resolveManagementCredentials(env, noWarning)).rejects.toMatchObject({
      code: "cli_auth_failed",
      exitCode: 3,
      hint: expect.stringContaining("meili auth login"),
    });
  });
});
