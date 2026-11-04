import { chmodSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ConfigFile,
  configFilePath,
  ENV_VARS,
  maskSecret,
  readConfigFile,
  redactBody,
  redactHeaders,
  resolveCloudProjectId,
  resolveProjectConnection,
  writeConfigFile,
} from "../../src/lib/config.js";
import { MeiliCliError } from "../../src/lib/errors.js";
import { readJson, scrubbedHome } from "../helpers/run-command.js";

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

  it("reads an entry's cloud identifiers, the team optional", () => {
    const path = join(scrubbedHome, "cloud.json");
    const cloud = { id: 343, teamId: 12, teamName: "Search" };
    writeConfigFile({
      path,
      projects: {
        prod: { url: "http://prod", cloud },
        dev: { url: "http://dev", cloud: { id: 7 } },
      },
    });
    expect(readConfigFile(path, noWarning).projects).toEqual({
      prod: { url: "http://prod", cloud },
      dev: { url: "http://dev", cloud: { id: 7 } },
    });
  });

  it("refuses invalid JSON and a shape other than projects of url, apiKey and cloud", () => {
    for (const [name, content] of [
      ["bad.json", "{"],
      ["shape.json", '{"current":"prod"}'],
      ["entry.json", '{"projects":{"prod":{"apiKey":"k"}}}'],
      ["key.json", '{"projects":{"prod":{"url":"http://p","apiKey":1}}}'],
      ["cloud.json", '{"projects":{"prod":{"url":"http://p","cloud":{"id":"343"}}}}'],
      ["team.json", '{"projects":{"prod":{"url":"http://p","cloud":{"id":343,"teamName":1}}}}'],
      ["cloud-id.json", '{"projects":{"prod":{"url":"http://p","cloudId":343,"cloud":7}}}'],
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
    expect(readJson(path)).toEqual({ projects: { prod } });
  });
});

describe("resolveCloudProjectId", () => {
  const entries = () =>
    file("ids.json", { prod: { url: "http://prod", cloud: { id: 343 } }, local });
  const unread = () => {
    throw new Error("the file must not be read");
  };

  it("takes --id as given, or the cloud.id of the entry --project names", () => {
    expect(resolveCloudProjectId({ id: 7 }, unread)).toBe(7);
    expect(resolveCloudProjectId({ project: "prod" }, entries)).toBe(343);
  });

  it("fails with cli_usage on both flags or neither", () => {
    expect(caught(() => resolveCloudProjectId({ id: 7, project: "prod" }, unread)).code).toBe(
      "cli_usage",
    );
    const neither = caught(() => resolveCloudProjectId({}, unread));
    expect(neither.code).toBe("cli_usage");
    expect(neither.message).toBe("Name the project with `--id <id>` or `--project <name>`.");
  });

  it("fails with cli_config, naming the command that sets it, on an entry without cloud identifiers", () => {
    const error = caught(() => resolveCloudProjectId({ project: "local" }, entries));
    expect(error.code).toBe("cli_config");
    expect(error.message).toContain("`local` has no cloud identifiers");
    expect(error.hint).toBe("Run `meili config update --project local --sync-with-cloud`.");
  });
});

describe("resolveProjectConnection", () => {
  const two = () => file("two.json", { prod, local });
  const none = () => file("none.json", {});
  const unread = () => {
    throw new Error("the file must not be read");
  };

  it("takes --project-url with its own key only, without reading the file", () => {
    expect(resolveProjectConnection({ url: "http://flag" }, unread)).toEqual({
      url: "http://flag",
      apiKey: undefined,
    });
    expect(resolveProjectConnection({ url: "http://flag", apiKey: "flagKey" }, unread)).toEqual({
      url: "http://flag",
      apiKey: "flagKey",
    });
  });

  it("refuses a --project-url that is not HTTP(S), an empty one included, without echoing it", () => {
    for (const url of ["", "ftp://user:secret@flag"]) {
      const error = caught(() => resolveProjectConnection({ url }, unread));
      expect(error.code).toBe("cli_usage");
      expect(error.exitCode).toBe(2);
      expect(error.message).not.toContain("secret");
    }
  });

  it("refuses --project with --project-url", () => {
    const error = caught(() =>
      resolveProjectConnection({ url: "http://flag", project: "prod" }, two),
    );
    expect(error.code).toBe("cli_usage");
    expect(error.exitCode).toBe(2);
  });

  it("takes the named project of the file, with the key the flag may replace", () => {
    expect(resolveProjectConnection({ project: "prod" }, two)).toEqual(prod);
    expect(resolveProjectConnection({ project: "prod", apiKey: "search" }, two)).toEqual({
      url: "http://prod",
      apiKey: "search",
    });
    expect(resolveProjectConnection({ project: "local" }, two)).toEqual({
      url: "http://local",
      apiKey: undefined,
    });
  });

  it("fails with cli_config, the path and the names when --project names nothing", () => {
    const noFile = caught(() => resolveProjectConnection({ project: "prod" }, none));
    expect(noFile.code).toBe("cli_config");
    expect(noFile.message).toBe(`No project \`prod\` in ${none().path}. Projects: none.`);
    const unknown = caught(() => resolveProjectConnection({ project: "nope" }, two));
    expect(unknown.code).toBe("cli_config");
    expect(unknown.message).toContain("Projects: prod, local");
  });

  it("never takes the only project of the file: without either flag it is cli_usage, exit 2", () => {
    for (const flags of [{}, { apiKey: "k" }]) {
      const error = caught(() => resolveProjectConnection(flags, unread));
      expect(error.code).toBe("cli_usage");
      expect(error.exitCode).toBe(2);
      expect(error.message).toContain("`--project <name>`");
      expect(error.message).toContain("`--project-url <url>`");
      expect(error.message).not.toContain("localhost");
      expect(error.hint).toBe("Run `meili config list` to see the projects of the config file.");
    }
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

  it("redacts apiKey, masterKey, key and token fields at any depth", () => {
    expect(
      redactBody({
        results: [{ uid: "1", key: "supersecretkey1a2b", nested: { token: "tok1234x" } }],
        apiKey: "k",
        apikey: "oldspelling1234",
        masterKey: "projectmasterkey9z8y",
        keep: "visible",
        count: 2,
      }),
    ).toEqual({
      results: [{ uid: "1", key: "****1a2b", nested: { token: "****234x" } }],
      apiKey: "****",
      apikey: "****1234",
      masterKey: "****9z8y",
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
      "MEILI_CONFIG",
      "MEILI_MANAGEMENT_TOKEN",
      "MEILI_MANAGEMENT_URL",
      "MEILI_MANAGEMENT_CLIENT_ID",
      "MEILI_MANAGEMENT_DASHBOARD_URL",
      "MEILI_TIMEOUT",
      "MEILI_NO_ANALYTICS",
    ]);
    for (const variable of ENV_VARS) expect(variable.description.length).toBeGreaterThan(0);
  });
});
