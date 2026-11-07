import { describe, expect, it } from "vitest";
import ConfigSyncWithCloud from "../../../src/commands/config/sync-with-cloud.js";
import type { Project } from "../../../src/lib/clients/management/generated/types.gen.js";
import {
  forbidden,
  managementEnv,
  managementHandlers,
  project,
  type ReceivedRequest,
  team,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { readJson, runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

useMockServer();

/** A project of the Cloud: `project` with another id, name, team and URL. */
function cloudProject(id: number, name: string, teamId: number, url: string | null): Project {
  return { ...project, id, name, teamId, url, masterKey: undefined };
}

const docs = cloudProject(344, "docs", 12, "https://ms-docs.sfo.meilisearch.io");
const searchA = cloudProject(351, "search", 13, "https://ms-a.sfo.meilisearch.io");
const searchB = cloudProject(352, "search", 14, "https://ms-b.sfo.meilisearch.io");
const creating = cloudProject(353, "creating", 13, null);
const teams = [
  team,
  { ...team, id: 13, name: "Docs", isAdmin: false },
  { ...team, id: 14, name: "Labs", isAdmin: false },
];
const team12 = { teamId: 12, teamName: "Search" };

describe("meili config sync-with-cloud", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["config", "sync-with-cloud", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("gives every project an entry: the one the file has, or a new one, the master key where the token reads it", async () => {
    server.use(
      managementHandlers.listProjects([project, docs, searchA, searchB, creating]),
      // The token owns team 12 only.
      managementHandlers.masterKey([project, docs]),
      managementHandlers.listTeams(teams),
    );
    const docsEntry = {
      url: "https://ms-docs.sfo.meilisearch.io",
      apiKey: "mine",
      cloud: { id: 344, teamId: 12, teamName: "Search" },
    };
    const { path, env } = tempConfig("sync-all.json", {
      local: { url: "http://localhost:7700" },
      prod: { url: "https://ms-abc.sfo.meilisearch.io" },
      docs: docsEntry,
    });
    const result = await runCommand(ConfigSyncWithCloud, ["--all"], {
      env: { ...managementEnv, ...env },
    });
    expect(result).toMatchSnapshot();
    expect(readJson(path)).toEqual({
      projects: {
        local: { url: "http://localhost:7700" },
        prod: {
          url: "https://ms-abc.sfo.meilisearch.io",
          apiKey: "masterKey-343",
          cloud: { id: 343, ...team12 },
        },
        docs: docsEntry,
        "search-351": {
          url: "https://ms-a.sfo.meilisearch.io",
          cloud: { id: 351, teamId: 13, teamName: "Docs" },
        },
        "search-352": {
          url: "https://ms-b.sfo.meilisearch.io",
          cloud: { id: 352, teamId: 14, teamName: "Labs" },
        },
      },
    });
  });

  it("tells a human in a terminal what it did", async () => {
    server.use(
      managementHandlers.listProjects([project, docs, searchA, searchB, creating]),
      // The token owns team 12 only.
      managementHandlers.masterKey([project, docs]),
      managementHandlers.listTeams(teams),
    );
    const docsEntry = {
      url: "https://ms-docs.sfo.meilisearch.io",
      apiKey: "mine",
      cloud: { id: 344, teamId: 12, teamName: "Search" },
    };
    const { env } = tempConfig("sync-all.json", {
      local: { url: "http://localhost:7700" },
      prod: { url: "https://ms-abc.sfo.meilisearch.io" },
      docs: docsEntry,
    });
    const result = await runCommand(ConfigSyncWithCloud, ["--all"], {
      env: { ...managementEnv, ...env },
      tty: true,
    });
    expect(result.stdout).toMatchSnapshot();
    expect(result.stderr).toContain("✓ 2 added, 1 updated, 1 unchanged in ");
  });

  it("reads every page, and only the teams of --team-ids", async () => {
    const received: ReceivedRequest[] = [];
    server.use(
      managementHandlers.listProjects([project, docs, searchA], received, 1),
      managementHandlers.masterKey([project, docs]),
      managementHandlers.listTeams(teams),
    );
    const { path, env } = tempConfig("sync-teams.json", {});
    const result = await runCommand(ConfigSyncWithCloud, ["--team-ids", "12"], {
      env: { ...managementEnv, ...env },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual([
      { project: "demo", cloud: { id: 343, ...team12 }, action: "added", apiKey: "written" },
      { project: "docs", cloud: { id: 344, ...team12 }, action: "added", apiKey: "written" },
    ]);
    expect(received.map(({ url }) => new URL(url).search)).toEqual([
      "?page=1&teamId=12",
      "?page=2&teamId=12",
    ]);
    expect(Object.keys((readJson(path) as { projects: object }).projects)).toEqual([
      "demo",
      "docs",
    ]);
  });

  it("reports an entry already in step as unchanged", async () => {
    server.use(managementHandlers.listProjects([docs]), managementHandlers.listTeams(teams));
    const entry = {
      url: "https://ms-docs.sfo.meilisearch.io",
      apiKey: "mine",
      cloud: { id: 344, teamId: 12, teamName: "Search" },
    };
    const { path, env } = tempConfig("sync-unchanged.json", { docs: entry });
    const result = await runCommand(ConfigSyncWithCloud, ["--project-name", "docs"], {
      env: { ...managementEnv, ...env },
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      { project: "docs", cloud: entry.cloud, action: "unchanged", apiKey: "kept" },
    ]);
    expect(readJson(path)).toEqual({ projects: { docs: entry } });
  });

  it("syncs the one project of --project-url, and fails when no project has the name or the URL", async () => {
    server.use(
      managementHandlers.listProjects([project, docs]),
      managementHandlers.masterKey([project]),
      managementHandlers.listTeams(teams),
    );
    const { path, env } = tempConfig("sync-one.json", {});
    const byUrl = await runCommand(
      ConfigSyncWithCloud,
      ["--project-url", "https://ms-abc.sfo.meilisearch.io"],
      { env: { ...managementEnv, ...env } },
    );
    expect(byUrl.exitCode).toBe(0);
    expect(Object.keys((readJson(path) as { projects: object }).projects)).toEqual(["demo"]);

    const byName = await runCommand(ConfigSyncWithCloud, ["--project-name", "Demo"], {
      env: { ...managementEnv, ...env },
    });
    expect(byName.exitCode).toBe(2);
    expect(JSON.parse(byName.stderr).error).toMatchObject({
      code: "cli_config",
      message: "No Meilisearch Cloud project is named `Demo`: nothing was written.",
    });
  });

  it("writes nothing when a suffixed name is taken too", async () => {
    server.use(
      managementHandlers.listProjects([searchA, searchB]),
      managementHandlers.listTeams(teams),
    );
    const { path, env } = tempConfig("sync-taken.json", {
      "search-352": { url: "http://elsewhere" },
    });
    const result = await runCommand(ConfigSyncWithCloud, ["--all"], {
      env: { ...managementEnv, ...env },
    });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr.trim().split("\n").at(-1) ?? "").error.code).toBe("cli_config");
    expect(readJson(path)).toEqual({ projects: { "search-352": { url: "http://elsewhere" } } });
  });

  it("refuses two entries without cloud identifiers on one project's URL", async () => {
    server.use(managementHandlers.listProjects([project]), managementHandlers.listTeams(teams));
    const url = "https://ms-abc.sfo.meilisearch.io";
    const { env } = tempConfig("sync-twice.json", { a: { url }, b: { url } });
    const result = await runCommand(ConfigSyncWithCloud, ["--all"], {
      env: { ...managementEnv, ...env },
    });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.message).toContain("Projects `a`, `b` of");
  });

  it("needs exactly one scope flag", async () => {
    for (const argv of [[], ["--all", "--team-ids", "12"]]) {
      const result = await runCommand(ConfigSyncWithCloud, argv, { env: managementEnv });
      expect(result.exitCode, argv.join(" ")).toBe(2);
      expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
    }
  });

  it("passes the API's error body through and writes nothing on a 403 of the list", async () => {
    server.use(managementHandlers.apiError("/api/v2/projects", 403, forbidden));
    const { path, env } = tempConfig("sync-forbidden.json", {});
    const result = await runCommand(ConfigSyncWithCloud, ["--all"], {
      env: { ...managementEnv, ...env },
    });
    expect(result).toMatchSnapshot();
    expect(readJson(path)).toEqual({ projects: {} });
  });
});
