import { describe, expect, it, vi } from "vitest";
import ConfigUpdate from "../../../src/commands/config/update.js";
import { useMockServer } from "../../helpers/msw.js";
import { readJson, runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

vi.mock("../../../src/lib/input.js", () => ({ readStdin: () => "key-from-stdin" }));

useMockServer();

describe("meili config update", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["config", "update", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("changes the fields given, keeps the others, and prints nothing", async () => {
    const { path, env } = tempConfig("update.json", {
      prod: { url: "https://p", apiKey: "old" },
      local: { url: "http://localhost:7700" },
    });
    const result = await runCommand(
      ConfigUpdate,
      [
        "--project",
        "prod",
        "--project-cloud-id",
        "343",
        "--project-api-key",
        "-",
        "--output",
        "json",
      ],
      { env },
    );
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(readJson(path)).toEqual({
      projects: {
        prod: { url: "https://p", apiKey: "key-from-stdin", cloudId: 343 },
        local: { url: "http://localhost:7700" },
      },
    });
  });

  it("refuses a name the file does not have, and a URL that is not HTTP(S)", async () => {
    const { path, env } = tempConfig("update-refused.json", { prod: { url: "https://p" } });
    const unknown = await runCommand(
      ConfigUpdate,
      ["--project", "nope", "--project-cloud-id", "1"],
      {
        env,
      },
    );
    expect(unknown.exitCode).toBe(2);
    expect(JSON.parse(unknown.stderr).error).toMatchObject({
      code: "cli_config",
      message: `No project \`nope\` in ${path}. Projects: prod.`,
    });

    const badUrl = await runCommand(
      ConfigUpdate,
      ["--project", "prod", "--project-url", "ftp://p"],
      {
        env,
      },
    );
    expect(badUrl.exitCode).toBe(2);
    expect(JSON.parse(badUrl.stderr).error.code).toBe("cli_usage");
    expect(readJson(path)).toEqual({ projects: { prod: { url: "https://p" } } });
  });
});
