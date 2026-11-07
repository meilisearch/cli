import { describe, expect, it, vi } from "vitest";
import ConfigUpdate from "../../../src/commands/config/update.js";
import {
  managementEnv,
  managementHandlers,
  project,
  team,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
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
      ["--project", "prod", "--project-url", "https://q", "--project-api-key", "-"],
      { env },
    );
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(readJson(path)).toEqual({
      projects: {
        prod: { url: "https://q", apiKey: "key-from-stdin" },
        local: { url: "http://localhost:7700" },
      },
    });
  });

  it("syncs an entry without cloud identifiers with the Cloud project of its URL, master key included", async () => {
    server.use(
      managementHandlers.listProjects([project]),
      managementHandlers.masterKey([project]),
      managementHandlers.listTeams(),
    );
    const { path, env } = tempConfig("update-sync-url.json", {
      prod: { url: "https://ms-abc.sfo.meilisearch.io" },
    });
    const result = await runCommand(ConfigUpdate, ["--project", "prod", "--sync-with-cloud"], {
      env: { ...managementEnv, ...env },
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(readJson(path)).toEqual({
      projects: {
        prod: {
          url: "https://ms-abc.sfo.meilisearch.io",
          apiKey: "masterKey-343",
          cloud: { id: 343, teamId: 12, teamName: "Search" },
        },
      },
    });
  });

  it("refreshes the cloud identifiers of the entry's cloud.id, keeps its key and its URL, and warns on a URL the Cloud does not give", async () => {
    server.use(
      managementHandlers.getProject([project]),
      managementHandlers.listTeams([{ ...team, name: "Renamed" }]),
    );
    const { path, env } = tempConfig("update-sync-id.json", {
      prod: { url: "https://elsewhere.example.com", apiKey: "mine", cloud: { id: 343 } },
    });
    const result = await runCommand(ConfigUpdate, ["--project", "prod", "--sync-with-cloud"], {
      env: { ...managementEnv, ...env },
    });
    expect(result).toMatchSnapshot();
    expect(readJson(path)).toEqual({
      projects: {
        prod: {
          url: "https://elsewhere.example.com",
          apiKey: "mine",
          cloud: { id: 343, teamId: 12, teamName: "Renamed" },
        },
      },
    });
  });

  it("tells a human in a terminal what it did", async () => {
    server.use(
      managementHandlers.getProject([project]),
      managementHandlers.listTeams([{ ...team, name: "Renamed" }]),
    );
    const { env } = tempConfig("update-sync-id.json", {
      prod: { url: "https://elsewhere.example.com", apiKey: "mine", cloud: { id: 343 } },
    });
    const result = await runCommand(ConfigUpdate, ["--project", "prod", "--sync-with-cloud"], {
      env: { ...managementEnv, ...env },
      tty: true,
    });
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("✓ Project prod is updated in ");
  });

  it("writes nothing when the Cloud has no project at the entry's URL", async () => {
    server.use(managementHandlers.listProjects([project]));
    const { path, env } = tempConfig("update-sync-none.json", {
      local: { url: "http://localhost:7700" },
    });
    const result = await runCommand(ConfigUpdate, ["--project", "local", "--sync-with-cloud"], {
      env: { ...managementEnv, ...env },
    });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_config");
    expect(readJson(path)).toEqual({ projects: { local: { url: "http://localhost:7700" } } });
  });

  it("refuses a name the file does not have, and a URL that is not HTTP(S)", async () => {
    const { path, env } = tempConfig("update-refused.json", { prod: { url: "https://p" } });
    const unknown = await runCommand(
      ConfigUpdate,
      ["--project", "nope", "--project-url", "https://n"],
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
