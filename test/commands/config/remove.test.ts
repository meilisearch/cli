import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ConfigRemove from "../../../src/commands/config/remove.js";
import { writeConfigFile } from "../../../src/lib/config.js";
import { useMockServer } from "../../helpers/msw.js";
import { readJson, runCli, runCommand, scrubbedHome } from "../../helpers/run-command.js";

useMockServer();

describe("meili config remove", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["config", "remove", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("removes the project and prints nothing", async () => {
    const path = join(scrubbedHome, "projects.json");
    writeConfigFile({ path, projects: { a: { url: "http://a" }, b: { url: "http://b" } } });
    const result = await runCommand(ConfigRemove, ["--project", "a", "--output", "json"], {
      env: { MEILI_CONFIG: path },
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(readJson(path)).toEqual({
      projects: { b: { url: "http://b" } },
    });
  });

  it("fails with cli_config when the project or the file does not exist", async () => {
    const path = join(scrubbedHome, "unknown.json");
    writeConfigFile({ path, projects: { b: { url: "http://b" } } });
    const unknown = await runCommand(ConfigRemove, ["--project", "nope"], {
      env: { MEILI_CONFIG: path },
    });
    expect(unknown.exitCode).toBe(2);
    expect(JSON.parse(unknown.stderr).error.message).toBe(
      `No project \`nope\` in ${path}. Projects: b.`,
    );

    const missing = join(scrubbedHome, "missing.json");
    const noFile = await runCommand(ConfigRemove, ["--project", "b"], {
      env: { MEILI_CONFIG: missing },
    });
    expect(noFile.exitCode).toBe(2);
    expect(JSON.parse(noFile.stderr).error.message).toBe(
      `No project \`b\` in ${missing}. Projects: none.`,
    );
  });
});
