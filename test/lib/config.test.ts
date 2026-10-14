import { chmodSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ConfigFile,
  configFilePath,
  DEFAULT_MANAGEMENT_URL,
  ENV_VARS,
  maskSecret,
  readConfigFile,
  redactBody,
  redactHeaders,
  resolveManagementCredentials,
  resolveProjectConnection,
  writeConfigFile,
} from "../../src/lib/config.js";
import { MeiliCliError } from "../../src/lib/errors.js";
import { scrubbedHome } from "../helpers/run-command.js";

/** A read that must not warn: an unexpected warning fails the test. */
const noWarning = (warning: MeiliCliError): never => {
  throw warning;
};

function caught(fn: () => unknown): MeiliCliError {
  try {
    fn();
  } catch (error) {
    if (error instanceof MeiliCliError) return error;
    throw error;
  }
  throw new Error("expected a MeiliCliError");
}

const file = (name: string, projects: ConfigFile["projects"]): ConfigFile => ({
  path: join(scrubbedHome, name),
  projects,
});
const prod = { url: "http://prod", apiKey: "prodKey" };
const local = { url: "http://local" };

describe("configFilePath", () => {
  it("takes MEILI_CONFIG, else XDG_CONFIG_HOME, else the home directory", () => {
    expect(configFilePath({ MEILI_CONFIG: "/etc/meili.json" })).toBe("/etc/meili.json");
    expect(configFilePath({ XDG_CONFIG_HOME: "/x" })).toBe("/x/meili/config.json");
    expect(configFilePath({ MEILI_CONFIG: "" })).toBe(join(homedir(), ".config/meili/config.json"));
  });
});

describe("readConfigFile", () => {
  it("has no project when the file does not exist", () => {
    const path = join(scrubbedHome, "missing.json");
    expect(readConfigFile(path, noWarning)).toEqual({ path, projects: {} });
  });

  it("reads the projects of an owner-only file", () => {
    writeConfigFile(file("ok.json", { prod, local }));
    expect(readConfigFile(join(scrubbedHome, "ok.json"), noWarning)).toEqual(
      file("ok.json", { prod, local }),
    );
  });

  // Windows has no file modes: readConfigFile does not check them there.
  it.skipIf(process.platform === "win32")(
    "warns about a file readable by others, with the chmod to run, and reads it",
    () => {
      const path = join(scrubbedHome, "open.json");
      writeFileSync(path, '{"projects":{"prod":{"url":"http://prod"}}}');
      chmodSync(path, 0o644);
      const warnings: MeiliCliError[] = [];
      expect(readConfigFile(path, (warning) => warnings.push(warning)).projects).toEqual({
        prod: { url: "http://prod" },
      });
      expect(warnings.map((warning) => warning.toBody())).toEqual([
        {
          code: "cli_config",
          type: "cli",
          message: `The config file ${path} is readable by others.`,
          hint: `Run \`chmod 600 ${path}\`.`,
        },
      ]);
    },
  );

  it("refuses invalid JSON and a shape other than projects of url and apiKey", () => {
    for (const [name, content] of [
      ["bad.json", "{"],
      ["shape.json", '{"current":"prod"}'],
      ["entry.json", '{"projects":{"prod":{"apiKey":"k"}}}'],
      ["key.json", '{"projects":{"prod":{"url":"http://p","apiKey":1}}}'],
    ] as const) {
      const path = join(scrubbedHome, name);
      writeFileSync(path, content, { mode: 0o600 });
      const error = caught(() => readConfigFile(path, noWarning));
      expect(error.code, name).toBe("cli_config");
      expect(error.message, name).toContain(path);
    }
  });
});

describe("writeConfigFile", () => {
  it("creates the directory and writes the file owner-only", () => {
    const path = join(scrubbedHome, "nested", "config.json");
    writeConfigFile({ path, projects: { prod } });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ projects: { prod } });
  });
});

describe("resolveProjectConnection", () => {
  const envPair = { MEILI_PROJECT_URL: "http://env", MEILI_PROJECT_API_KEY: "envKey" };
  const two = () => file("two.json", { prod, local });
  const one = () => file("one.json", { prod });
  const none = () => file("none.json", {});
  const unread = () => {
    throw new Error("the file must not be read");
  };

  it("takes the command line first, the URL with its own key only, without reading the file", () => {
    expect(resolveProjectConnection({ url: "http://flag" }, envPair, unread)).toEqual({
      url: "http://flag",
      apiKey: undefined,
    });
    expect(
      resolveProjectConnection({ url: "http://flag", apiKey: "flagKey" }, envPair, unread),
    ).toEqual({ url: "http://flag", apiKey: "flagKey" });
  });

  it("refuses --project with --project-url", () => {
    const error = caught(() =>
      resolveProjectConnection({ url: "http://flag", project: "prod" }, {}, two),
    );
    expect(error.code).toBe("cli_usage");
    expect(error.exitCode).toBe(2);
  });

  it("takes the named project of the file, with the key the flag may replace", () => {
    expect(resolveProjectConnection({ project: "prod" }, envPair, two)).toEqual(prod);
    expect(resolveProjectConnection({ project: "prod", apiKey: "search" }, {}, two)).toEqual({
      url: "http://prod",
      apiKey: "search",
    });
    expect(resolveProjectConnection({ project: "local" }, {}, two)).toEqual({
      url: "http://local",
      apiKey: undefined,
    });
  });

  it("fails with cli_config, the path and the names when --project names nothing", () => {
    const noFile = caught(() => resolveProjectConnection({ project: "prod" }, {}, none));
    expect(noFile.code).toBe("cli_config");
    expect(noFile.message).toBe(`No project \`prod\` in ${none().path}. Projects: none.`);
    const unknown = caught(() => resolveProjectConnection({ project: "nope" }, {}, two));
    expect(unknown.code).toBe("cli_config");
    expect(unknown.message).toContain("Projects: prod, local");
  });

  it("takes the environment pair when it is the only ambient source", () => {
    expect(resolveProjectConnection({}, envPair, none)).toEqual({
      url: "http://env",
      apiKey: "envKey",
    });
    expect(resolveProjectConnection({ apiKey: "flagKey" }, envPair, none).apiKey).toBe("flagKey");
    expect(
      resolveProjectConnection(
        {},
        { MEILI_PROJECT_URL: "http://env", MEILI_PROJECT_API_KEY: "" },
        none,
      ).apiKey,
    ).toBeUndefined();
  });

  it("refuses the environment pair next to a file that has projects", () => {
    const error = caught(() => resolveProjectConnection({}, envPair, one));
    expect(error.code).toBe("cli_config");
    expect(error.message).toContain("MEILI_PROJECT_URL");
    expect(error.message).toContain(one().path);
    expect(error.hint).toContain("MEILI_CONFIG");
  });

  it("takes the only project of the file, and refuses to pick among several", () => {
    expect(resolveProjectConnection({}, {}, one)).toEqual(prod);
    expect(resolveProjectConnection({ apiKey: "search" }, {}, one).apiKey).toBe("search");
    const error = caught(() => resolveProjectConnection({}, {}, two));
    expect(error.code).toBe("cli_config");
    expect(error.message).toBe("Pick a project with `--project`: prod, local.");
  });

  it("fails with cli_config and exit 2 without any project, naming the three ways to give one", () => {
    const error = caught(() => resolveProjectConnection({}, { MEILI_PROJECT_API_KEY: "k" }, none));
    expect(error.code).toBe("cli_config");
    expect(error.exitCode).toBe(2);
    expect(error.message).toContain("`--project-url`");
    expect(error.message).toContain("`MEILI_PROJECT_URL`");
    expect(error.message).toContain(none().path);
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
      "MEILI_CONFIG",
      "MEILI_MANAGEMENT_TOKEN",
      "MEILI_MANAGEMENT_URL",
      "MEILI_OUTPUT",
      "MEILI_TIMEOUT",
    ]);
    for (const variable of ENV_VARS) expect(variable.description.length).toBeGreaterThan(0);
  });
});
