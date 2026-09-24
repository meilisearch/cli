import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANAGEMENT_URL,
  ENV_VARS,
  maskSecret,
  readConfigFile,
  redactBody,
  redactHeaders,
  resolveConfigDir,
  resolveEngineConnection,
  resolveManagementCredentials,
} from "../../src/lib/config.js";
import { MeiliCliError } from "../../src/lib/errors.js";

function tempFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "meili-config-"));
  const path = join(dir, "config.json");
  writeFileSync(path, content);
  return path;
}

function caught(fn: () => unknown): MeiliCliError {
  try {
    fn();
  } catch (error) {
    if (error instanceof MeiliCliError) return error;
    throw error;
  }
  throw new Error("expected a MeiliCliError");
}

describe("resolveConfigDir", () => {
  it("prefers MEILI_CONFIG_DIR, then XDG_CONFIG_HOME, then HOME", () => {
    expect(
      resolveConfigDir({
        env: { MEILI_CONFIG_DIR: "/explicit", XDG_CONFIG_HOME: "/xdg", HOME: "/home/me" },
        platform: "linux",
      }),
    ).toBe("/explicit");
    expect(
      resolveConfigDir({ env: { XDG_CONFIG_HOME: "/xdg", HOME: "/home/me" }, platform: "linux" }),
    ).toBe("/xdg/meili");
    expect(resolveConfigDir({ env: { HOME: "/home/me" }, platform: "darwin" })).toBe(
      "/home/me/.config/meili",
    );
  });

  it("returns undefined without HOME instead of failing", () => {
    expect(resolveConfigDir({ env: {}, platform: "linux" })).toBeUndefined();
  });

  it("uses the oclif directory on Windows", () => {
    expect(
      resolveConfigDir({
        env: { HOME: "C:\\Users\\me" },
        platform: "win32",
        oclifConfigDir: "C:\\cfg",
      }),
    ).toBe("C:\\cfg");
  });
});

describe("readConfigFile", () => {
  it("returns undefined when the file does not exist", () => {
    expect(readConfigFile("/nonexistent/meili/config.json")).toBeUndefined();
  });

  it("parses and normalizes a valid file", () => {
    const path = tempFile(
      JSON.stringify({
        version: 1,
        defaultContext: "prod",
        contexts: { prod: { url: "https://ms.example", apiKey: "k" }, local: { url: "http://l" } },
        management: { token: "t" },
      }),
    );
    expect(readConfigFile(path)).toEqual({
      version: 1,
      defaultContext: "prod",
      contexts: { prod: { url: "https://ms.example", apiKey: "k" }, local: { url: "http://l" } },
      management: { token: "t" },
    });
  });

  it("reports the line and column of a syntax error with cli_config", () => {
    const path = tempFile('{\n  "version": 1,\n  "contexts": {\n    "prod": { "url": }\n  }\n}\n');
    const error = caught(() => readConfigFile(path));
    expect(error.code).toBe("cli_config");
    expect(error.exitCode).toBe(2);
    expect(error.message).toMatch(/Invalid JSON in .*config\.json at line 4 column 22/);
  });

  it("recovers the line from every shape of V8 message", () => {
    const cases: Array<[string, RegExp]> = [
      ['{"a": }', /line 1 column 7/],
      ['{"a": 1,}', /line 1 column 9/],
      ['{"a": 1} x', /line 1 column 10/],
      ['{"a": "b', /line 1 column 9/],
      [
        '{"a": 1,\n"b": 2,\n"c": 3,\n"d": 4,\n"e": bad,\n"f": 6,\n"g": 7,\n"h": 8}',
        /line 5 column 6/,
      ],
      ["", /line 1 column 1/],
    ];
    for (const [content, expected] of cases) {
      expect(caught(() => readConfigFile(tempFile(content))).message, content).toMatch(expected);
    }
  });

  it("reports the path of an invalid field", () => {
    expect(caught(() => readConfigFile(tempFile('{"version": 2}'))).message).toContain(
      "`version` must be 1",
    );
    expect(
      caught(() => readConfigFile(tempFile('{"version": 1, "contexts": {"prod": {}}}'))).message,
    ).toContain("`contexts.prod.url` must be a non-empty string");
    expect(
      caught(() =>
        readConfigFile(tempFile('{"version": 1, "defaultContext": "nope", "contexts": {}}')),
      ).message,
    ).toContain("`defaultContext` must be the name of a context");
  });
});

describe("resolveEngineConnection", () => {
  const file = {
    version: 1 as const,
    defaultContext: "prod",
    contexts: {
      prod: { url: "https://prod.example", apiKey: "prodKey" },
      local: { url: "http://localhost:7700" },
    },
  };

  it("resolves flag, then env, then the named context, then the default context, field by field", () => {
    expect(
      resolveEngineConnection({
        flags: { url: "http://flag" },
        env: { MEILI_URL: "http://env" },
        file,
      }),
    ).toEqual({
      url: "http://flag",
      apiKey: "prodKey",
      sources: { url: "flag", apiKey: "context:prod" },
    });
    expect(
      resolveEngineConnection({
        flags: {},
        env: { MEILI_URL: "http://env", MEILI_API_KEY: "envKey" },
        file,
      }),
    ).toEqual({ url: "http://env", apiKey: "envKey", sources: { url: "env", apiKey: "env" } });
    expect(resolveEngineConnection({ flags: { context: "local" }, env: {}, file })).toEqual({
      url: "http://localhost:7700",
      apiKey: undefined,
      sources: { url: "context:local", apiKey: undefined },
    });
    expect(
      resolveEngineConnection({ flags: {}, env: { MEILI_CONTEXT: "local" }, file }).sources.url,
    ).toBe("context:local");
    expect(resolveEngineConnection({ flags: {}, env: {}, file })).toEqual({
      url: "https://prod.example",
      apiKey: "prodKey",
      sources: { url: "context:prod", apiKey: "context:prod" },
    });
  });

  it("ignores empty environment variables", () => {
    expect(resolveEngineConnection({ flags: {}, env: { MEILI_URL: "" }, file }).url).toBe(
      "https://prod.example",
    );
  });

  it("fails with cli_config and exit 2 without a URL, naming the three ways to give one", () => {
    const error = caught(() => resolveEngineConnection({ flags: {}, env: {}, file: undefined }));
    expect(error.code).toBe("cli_config");
    expect(error.exitCode).toBe(2);
    expect(error.message).toContain("`--url`");
    expect(error.message).toContain("`MEILI_URL`");
    expect(error.message).toContain("`--context <name>`");
    expect(error.message).not.toContain("MANAGEMENT");
  });

  it("never falls back to localhost", () => {
    const error = caught(() =>
      resolveEngineConnection({ flags: {}, env: { MEILI_API_KEY: "k" }, file: undefined }),
    );
    expect(error.message).not.toContain("localhost");
  });

  it("fails with cli_config and exit 4 for an unknown context", () => {
    const error = caught(() =>
      resolveEngineConnection({
        flags: { context: "nope" },
        env: {},
        file,
        filePath: "/c/config.json",
      }),
    );
    expect(error.code).toBe("cli_config");
    expect(error.exitCode).toBe(4);
    expect(error.message).toBe("Context `nope` not found: not defined in /c/config.json.");
    expect(error.hint).toBe("Run `meili context list` to see the available contexts.");

    expect(
      caught(() =>
        resolveEngineConnection({
          flags: { context: "nope" },
          env: {},
          file: undefined,
          filePath: "/c/config.json",
        }),
      ).message,
    ).toBe("Context `nope` not found: no config file found at /c/config.json.");
  });
});

describe("resolveManagementCredentials", () => {
  const file = { version: 1 as const, contexts: {}, management: { token: "fileToken" } };

  it("resolves flag, then env, then the stored token", () => {
    expect(
      resolveManagementCredentials({
        flags: { managementToken: "flagToken" },
        env: { MEILI_MANAGEMENT_TOKEN: "envToken" },
        file,
      }),
    ).toEqual({
      token: "flagToken",
      url: DEFAULT_MANAGEMENT_URL,
      sources: { token: "flag", url: "default" },
    });
    expect(
      resolveManagementCredentials({
        flags: {},
        env: { MEILI_MANAGEMENT_TOKEN: "envToken", MEILI_MANAGEMENT_URL: "http://mgmt.test" },
        file,
      }),
    ).toEqual({
      token: "envToken",
      url: "http://mgmt.test",
      sources: { token: "env", url: "env" },
    });
    expect(resolveManagementCredentials({ flags: {}, env: {}, file }).sources.token).toBe("config");
  });

  it("fails before any network call with cli_auth_missing and exit 3", () => {
    const error = caught(() =>
      resolveManagementCredentials({ flags: {}, env: {}, file: undefined }),
    );
    expect(error.code).toBe("cli_auth_missing");
    expect(error.exitCode).toBe(3);
    expect(error.message).toContain("`--management-token`");
    expect(error.message).toContain("`MEILI_MANAGEMENT_TOKEN`");
    expect(error.message).toContain("`meili management login`");
    expect(error.message).not.toContain("MEILI_URL");
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
        keep: "visible",
        count: 2,
      }),
    ).toEqual({
      results: [{ uid: "1", key: "****1a2b", nested: { token: "****234x" } }],
      apiKey: "****",
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
      "MEILI_URL",
      "MEILI_API_KEY",
      "MEILI_CONTEXT",
      "MEILI_MANAGEMENT_TOKEN",
      "MEILI_MANAGEMENT_URL",
      "MEILI_OUTPUT",
      "MEILI_TIMEOUT",
      "MEILI_CONFIG_DIR",
      "NO_COLOR",
    ]);
    for (const variable of ENV_VARS) expect(variable.description.length).toBeGreaterThan(0);
  });
});
