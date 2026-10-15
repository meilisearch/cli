import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import ConfigAdd from "../../../src/commands/config/add.js";
import { useMockServer } from "../../helpers/msw.js";
import { readJson as read, runCli, runCommand, scrubbedHome } from "../../helpers/run-command.js";

vi.mock("../../../src/lib/input.js", () => ({ readStdin: () => "key-from-stdin" }));

useMockServer();

describe("meili config add", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["config", "add", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("creates the file with the project, and prints nothing", async () => {
    const path = join(scrubbedHome, "new", "config.json");
    const result = await runCommand(
      ConfigAdd,
      ["--project", "local", "--project-url", "http://localhost:7700", "--output", "json"],
      { env: { MEILI_CONFIG: path } },
    );
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(read(path)).toEqual({ projects: { local: { url: "http://localhost:7700" } } });
  });

  it("stores the Cloud id given with --project-cloud-id", async () => {
    const path = join(scrubbedHome, "cloud.json");
    const result = await runCommand(
      ConfigAdd,
      ["--project", "prod", "--project-url", "https://p", "--project-cloud-id", "343"],
      { env: { MEILI_CONFIG: path } },
    );
    expect(result.exitCode).toBe(0);
    expect(read(path)).toEqual({ projects: { prod: { url: "https://p", cloudId: 343 } } });
  });

  it("reads the key from stdin with -", async () => {
    const path = join(scrubbedHome, "stdin.json");
    const result = await runCommand(
      ConfigAdd,
      ["--project", "prod", "--project-url", "https://prod.example.com", "--project-api-key", "-"],
      { env: { MEILI_CONFIG: path } },
    );
    expect(result.exitCode).toBe(0);
    expect(read(path)).toEqual({
      projects: { prod: { url: "https://prod.example.com", apiKey: "key-from-stdin" } },
    });
  });

  it("adds to an existing file and refuses a name that exists", async () => {
    const path = join(scrubbedHome, "existing.json");
    const env = { MEILI_CONFIG: path };
    await runCommand(ConfigAdd, ["--project", "a", "--project-url", "http://a"], { env });
    await runCommand(ConfigAdd, ["--project", "b", "--project-url", "http://b"], { env });
    expect(read(path)).toEqual({ projects: { a: { url: "http://a" }, b: { url: "http://b" } } });

    const result = await runCommand(ConfigAdd, ["--project", "a", "--project-url", "http://c"], {
      env,
    });
    expect(result.exitCode).toBe(2);
    const error = JSON.parse(result.stderr).error as { code: string; hint: string };
    expect(error.code).toBe("cli_config");
    expect(error.hint).toBe("Run `meili config remove --project a` first.");
    expect(read(path)).toEqual({ projects: { a: { url: "http://a" }, b: { url: "http://b" } } });
  });

  it("rejects a URL that is invalid or not HTTP(S) with cli_usage", async () => {
    for (const url of ["not a url", "ftp://example.com", "localhost:7700"]) {
      const result = await runCommand(ConfigAdd, ["--project", "ok", "--project-url", url], {
        env: { MEILI_CONFIG: join(scrubbedHome, "invalid.json") },
      });
      expect(result.exitCode, url).toBe(2);
      expect(JSON.parse(result.stderr).error.code, url).toBe("cli_usage");
    }
  });
});
