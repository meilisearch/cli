import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ConfigUpdate from "../../../src/commands/config/update.js";
import { writeConfigFile } from "../../../src/lib/config.js";
import { useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand, scrubbedHome } from "../../helpers/run-command.js";

useMockServer();

const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;

describe("meili config update", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["config", "update", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("changes the fields given and keeps the others, and prints nothing", async () => {
    const path = join(scrubbedHome, "update.json");
    writeConfigFile({ path, projects: { prod: { url: "https://old", apiKey: "k" } } });
    const env = { MEILI_CONFIG: path };
    const result = await runCommand(
      ConfigUpdate,
      ["--project", "prod", "--project-cloud-id", "343", "--output", "json"],
      { env },
    );
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(read(path)).toEqual({
      projects: { prod: { url: "https://old", apiKey: "k", cloudId: 343 } },
    });

    await runCommand(ConfigUpdate, ["--project", "prod", "--project-url", "https://new"], { env });
    expect(read(path)).toEqual({
      projects: { prod: { url: "https://new", apiKey: "k", cloudId: 343 } },
    });
  });

  it("fails with cli_usage without a field to change, and cli_config on an unknown project", async () => {
    const path = join(scrubbedHome, "update-errors.json");
    writeConfigFile({ path, projects: { prod: { url: "https://p" } } });
    const env = { MEILI_CONFIG: path };
    const nothing = await runCommand(ConfigUpdate, ["--project", "prod"], { env });
    expect(nothing.exitCode).toBe(2);
    expect(JSON.parse(nothing.stderr).error.code).toBe("cli_usage");
    const unknown = await runCommand(
      ConfigUpdate,
      ["--project", "nope", "--project-cloud-id", "1"],
      {
        env,
      },
    );
    expect(unknown.exitCode).toBe(2);
    expect(JSON.parse(unknown.stderr).error.message).toBe(
      `No project \`nope\` in ${path}. Projects: prod.`,
    );
  });
});
