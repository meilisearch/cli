import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ConfigList from "../../../src/commands/config/list.js";
import { writeConfigFile } from "../../../src/lib/config.js";
import { useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand, scrubbedHome } from "../../helpers/run-command.js";

useMockServer();

describe("meili config list", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["config", "list", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the path and no project when there is no file", async () => {
    const path = join(scrubbedHome, "missing.json");
    const result = await runCommand(ConfigList, ["--output", "json"], {
      env: { MEILI_CONFIG: path },
    });
    expect(result).toEqual({
      stdout: `{"path":"${path}","projects":{}}\n`,
      stderr: "",
      exitCode: 0,
    });
  });

  it("prints the projects with their keys masked", async () => {
    const path = join(scrubbedHome, "config.json");
    writeConfigFile({
      path,
      projects: {
        local: { url: "http://localhost:7700" },
        prod: { url: "https://prod.example.com", apiKey: "supersecretkey1a2b" },
      },
    });
    const result = await runCommand(ConfigList, ["--output", "json"], {
      env: { MEILI_CONFIG: path },
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      path,
      projects: {
        local: { url: "http://localhost:7700" },
        prod: { url: "https://prod.example.com", apiKey: "****1a2b" },
      },
    });
    expect(result.stdout).not.toContain("supersecretkey");
  });
});
