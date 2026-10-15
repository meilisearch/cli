import { describe, expect, it } from "vitest";
import ConfigUpdate from "../../../src/commands/config/update.js";
import { useMockServer } from "../../helpers/msw.js";
import { readJson, runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

useMockServer();

describe("meili config update", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["config", "update", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("changes the fields given and keeps the others, and prints nothing", async () => {
    const { path, env } = tempConfig("update.json", { prod: { url: "https://old", apiKey: "k" } });
    const result = await runCommand(
      ConfigUpdate,
      ["--project", "prod", "--project-cloud-id", "343", "--output", "json"],
      { env },
    );
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(readJson(path)).toEqual({
      projects: { prod: { url: "https://old", apiKey: "k", cloudId: 343 } },
    });

    await runCommand(ConfigUpdate, ["--project", "prod", "--project-url", "https://new"], { env });
    expect(readJson(path)).toEqual({
      projects: { prod: { url: "https://new", apiKey: "k", cloudId: 343 } },
    });
  });

  it("fails with cli_usage without a field to change, and cli_config on an unknown project", async () => {
    const { path, env } = tempConfig("update-errors.json", { prod: { url: "https://p" } });
    const nothing = await runCommand(ConfigUpdate, ["--project", "prod"], { env });
    expect(nothing.exitCode).toBe(2);
    expect(JSON.parse(nothing.stderr).error.code).toBe("cli_usage");
    const unknown = await runCommand(
      ConfigUpdate,
      ["--project", "nope", "--project-cloud-id", "1"],
      { env },
    );
    expect(unknown.exitCode).toBe(2);
    expect(JSON.parse(unknown.stderr).error.message).toBe(
      `No project \`nope\` in ${path}. Projects: prod.`,
    );
  });
});
