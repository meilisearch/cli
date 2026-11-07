import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import ConfigSet from "../../../src/commands/config/set.js";
import {
  MANAGEMENT_TOKEN,
  managementEnv,
  managementHandlers,
  project,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { readJson as read, runCli, runCommand, scrubbedHome } from "../../helpers/run-command.js";

vi.mock("../../../src/lib/input.js", () => ({ readStdin: () => "key-from-stdin" }));

useMockServer();

describe("meili config set", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["config", "set", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("creates the file with the project, and prints nothing", async () => {
    const path = join(scrubbedHome, "new", "config.json");
    const result = await runCommand(
      ConfigSet,
      ["--project", "local", "--project-url", "http://localhost:7700"],
      { env: { MEILI_CONFIG: path } },
    );
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(read(path)).toEqual({ projects: { local: { url: "http://localhost:7700" } } });
  });

  it("tells a human in a terminal what it did", async () => {
    const path = join(scrubbedHome, "human", "config.json");
    const result = await runCommand(
      ConfigSet,
      ["--project", "local", "--project-url", "http://localhost:7700"],
      { env: { MEILI_CONFIG: path }, tty: true },
    );
    expect(result).toEqual({
      stdout: "",
      stderr: `✓ Project local is added to ${path}. Use it with -p local.\n`,
      exitCode: 0,
    });
  });

  it("writes the cloud identifiers and the master key of the Cloud project with that URL, with --sync-with-cloud", async () => {
    const received: ReceivedRequest[] = [];
    server.use(
      managementHandlers.listProjects([project], received),
      managementHandlers.masterKey([project]),
      managementHandlers.listTeams(),
    );
    const path = join(scrubbedHome, "sync.json");
    const result = await runCommand(
      ConfigSet,
      [
        "--project",
        "prod",
        "--project-url",
        "https://ms-abc.sfo.meilisearch.io/",
        "--sync-with-cloud",
      ],
      { env: { ...managementEnv, MEILI_CONFIG: path } },
    );
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(received[0]?.authorization).toBe(`Bearer ${MANAGEMENT_TOKEN}`);
    expect(read(path)).toEqual({
      projects: {
        prod: {
          url: "https://ms-abc.sfo.meilisearch.io/",
          apiKey: "masterKey-343",
          cloud: { id: 343, teamId: 12, teamName: "Search" },
        },
      },
    });
  });

  it("keeps the key given, and writes the entry without a key, with a warning, when the master key is not readable", async () => {
    server.use(
      managementHandlers.listProjects([project]),
      managementHandlers.masterKey([]),
      managementHandlers.listTeams(),
    );
    const env = { ...managementEnv, MEILI_CONFIG: join(scrubbedHome, "sync-keys.json") };
    const url = "https://ms-abc.sfo.meilisearch.io";
    const given = await runCommand(
      ConfigSet,
      ["--project", "given", "--project-url", url, "--project-api-key", "-", "--sync-with-cloud"],
      { env },
    );
    expect(given).toEqual({ stdout: "", stderr: "", exitCode: 0 });

    const member = await runCommand(
      ConfigSet,
      ["--project", "member", "--project-url", url, "--sync-with-cloud"],
      { env },
    );
    expect(member).toMatchSnapshot();
    const cloud = { id: 343, teamId: 12, teamName: "Search" };
    expect(read(env.MEILI_CONFIG)).toEqual({
      projects: { given: { url, apiKey: "key-from-stdin", cloud }, member: { url, cloud } },
    });
  });

  it("writes nothing when no Cloud project has the URL, with cli_config", async () => {
    server.use(managementHandlers.listProjects([project]));
    const path = join(scrubbedHome, "sync-none.json");
    const result = await runCommand(
      ConfigSet,
      ["--project", "x", "--project-url", "https://nope.example.com", "--sync-with-cloud"],
      { env: { ...managementEnv, MEILI_CONFIG: path } },
    );
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "cli_config",
      message:
        "No Meilisearch Cloud project has the URL https://nope.example.com: nothing was written.",
    });
    expect(existsSync(path)).toBe(false);
  });

  it("reads the key from stdin with -", async () => {
    const path = join(scrubbedHome, "stdin.json");
    const result = await runCommand(
      ConfigSet,
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
    await runCommand(ConfigSet, ["--project", "a", "--project-url", "http://a"], { env });
    await runCommand(ConfigSet, ["--project", "b", "--project-url", "http://b"], { env });
    expect(read(path)).toEqual({ projects: { a: { url: "http://a" }, b: { url: "http://b" } } });

    const result = await runCommand(ConfigSet, ["--project", "a", "--project-url", "http://c"], {
      env,
    });
    expect(result.exitCode).toBe(2);
    const error = JSON.parse(result.stderr).error as { code: string; hint: string };
    expect(error.code).toBe("cli_config");
    expect(error.hint).toBe(
      "Run `meili config update --project a` to change it, or `meili config unset --project a` first.",
    );
    expect(read(path)).toEqual({ projects: { a: { url: "http://a" }, b: { url: "http://b" } } });
  });

  it("rejects a URL that is invalid or not HTTP(S) with cli_usage", async () => {
    for (const url of ["not a url", "ftp://example.com", "localhost:7700"]) {
      const result = await runCommand(ConfigSet, ["--project", "ok", "--project-url", url], {
        env: { MEILI_CONFIG: join(scrubbedHome, "invalid.json") },
      });
      expect(result.exitCode, url).toBe(2);
      expect(JSON.parse(result.stderr).error.code, url).toBe("cli_usage");
    }
  });
});
