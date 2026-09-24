import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANAGEMENT_URL,
  ENV_VARS,
  maskSecret,
  redactBody,
  redactHeaders,
  resolveManagementCredentials,
  resolveProjectConnection,
} from "../../src/lib/config.js";
import { MeiliCliError } from "../../src/lib/errors.js";

function caught(fn: () => unknown): MeiliCliError {
  try {
    fn();
  } catch (error) {
    if (error instanceof MeiliCliError) return error;
    throw error;
  }
  throw new Error("expected a MeiliCliError");
}

describe("resolveProjectConnection", () => {
  const env = { MEILI_PROJECT_URL: "http://env", MEILI_PROJECT_API_KEY: "envKey" };

  it("resolves flags, then environment variables, field by field", () => {
    expect(resolveProjectConnection({ url: "http://flag" }, env)).toEqual({
      url: "http://flag",
      apiKey: "envKey",
    });
    expect(resolveProjectConnection({ url: "http://flag", apiKey: "flagKey" }, env)).toEqual({
      url: "http://flag",
      apiKey: "flagKey",
    });
    expect(resolveProjectConnection({}, { MEILI_PROJECT_URL: "http://env" })).toEqual({
      url: "http://env",
      apiKey: undefined,
    });
  });

  it("ignores empty environment variables", () => {
    expect(
      resolveProjectConnection({ url: "http://flag" }, { MEILI_PROJECT_API_KEY: "" }).apiKey,
    ).toBeUndefined();
  });

  it("fails with cli_config and exit 2 without a URL, naming the two ways to give one", () => {
    const error = caught(() => resolveProjectConnection({}, { MEILI_PROJECT_API_KEY: "k" }));
    expect(error.code).toBe("cli_config");
    expect(error.exitCode).toBe(2);
    expect(error.message).toContain("`--project-url`");
    expect(error.message).toContain("`MEILI_PROJECT_URL`");
    expect(error.message).not.toContain("MANAGEMENT");
    expect(error.message).not.toContain("localhost");
  });
});

describe("resolveManagementCredentials", () => {
  it("reads the token and the URL, with the production URL by default", () => {
    expect(resolveManagementCredentials({ MEILI_MANAGEMENT_TOKEN: "envToken" })).toEqual({
      token: "envToken",
      url: DEFAULT_MANAGEMENT_URL,
    });
    expect(
      resolveManagementCredentials({
        MEILI_MANAGEMENT_TOKEN: "envToken",
        MEILI_MANAGEMENT_URL: "http://mgmt.test",
      }),
    ).toEqual({ token: "envToken", url: "http://mgmt.test" });
  });

  it("fails before any network call with cli_auth_missing and exit 3", () => {
    const error = caught(() => resolveManagementCredentials({}));
    expect(error.code).toBe("cli_auth_missing");
    expect(error.exitCode).toBe(3);
    expect(error.message).toContain("`MEILI_MANAGEMENT_TOKEN`");
    expect(error.message).not.toContain("MEILI_PROJECT_URL");
    expect(error.hint).toContain("personal access token");
  });
});

describe("redaction", () => {
  it("masks all but the last four characters", () => {
    expect(maskSecret("supersecretkey1a2b")).toBe("****1a2b");
    expect(maskSecret("abcd")).toBe("****");
    expect(maskSecret("")).toBe("****");
  });

  it("redacts the Authorization header and keeps the scheme", () => {
    const headers = new Headers({
      Authorization: "Bearer supersecretkey1a2b",
      "Content-Type": "application/json",
      "X-Meili-API-Key": "supersecretkey1a2b",
    });
    expect(redactHeaders(headers)).toEqual({
      authorization: "Bearer ****1a2b",
      "content-type": "application/json",
      "x-meili-api-key": "****1a2b",
    });
  });

  it("redacts apiKey, key and token fields at any depth", () => {
    expect(
      redactBody({
        results: [{ uid: "1", key: "supersecretkey1a2b", nested: { token: "tok1234x" } }],
        apiKey: "k",
        apikey: "masterKey1234",
        keep: "visible",
        count: 2,
      }),
    ).toEqual({
      results: [{ uid: "1", key: "****1a2b", nested: { token: "****234x" } }],
      apiKey: "****",
      apikey: "****1234",
      keep: "visible",
      count: 2,
    });
    expect(redactBody({ key: 42 })).toEqual({ key: "****" });
    expect(redactBody("plain")).toBe("plain");
  });
});

describe("ENV_VARS", () => {
  it("lists every variable with a description", () => {
    expect(ENV_VARS.map((variable) => variable.name)).toEqual([
      "MEILI_PROJECT_URL",
      "MEILI_PROJECT_API_KEY",
      "MEILI_MANAGEMENT_TOKEN",
      "MEILI_MANAGEMENT_URL",
      "MEILI_OUTPUT",
      "MEILI_TIMEOUT",
    ]);
    for (const variable of ENV_VARS) expect(variable.description.length).toBeGreaterThan(0);
  });
});
