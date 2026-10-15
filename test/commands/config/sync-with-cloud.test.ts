import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ConfigSyncWithCloud from "../../../src/commands/config/sync-with-cloud.js";
import {
  MANAGEMENT_URL,
  managementEnv,
  managementHandlers,
  project,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { readJson, runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

useMockServer();

const staging = { ...project, id: 344, name: "staging", url: "https://ms-def.sfo.meilisearch.io" };
const fresh = { ...project, id: 345, name: "fresh", url: "https://ms-ghi.sfo.meilisearch.io" };

describe("meili config sync-with-cloud", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["config", "sync-with-cloud", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("adds the missing projects, sets cloudId by URL, keeps the rest, never writes a key", async () => {
    const { path, env } = tempConfig("sync.json", {
      demo: { url: "https://ms-abc.sfo.meilisearch.io", cloudId: 343 },
      "my-staging": { url: "https://MS-DEF.sfo.meilisearch.io/", apiKey: "search" },
      local: { url: "http://localhost:7700" },
      gone: { url: "https://ms-old.sfo.meilisearch.io", cloudId: 1 },
    });
    server.use(managementHandlers.listProjects([project, staging, fresh]));
    const result = await runCommand(ConfigSyncWithCloud, ["--output", "json"], {
      env: { ...managementEnv, ...env },
    });
    expect(result).toEqual({
      stdout:
        '{"added":["fresh"],"updated":["my-staging"],"unchanged":["demo"],"missing":["gone"]}\n',
      stderr: "",
      exitCode: 0,
    });
    expect(readJson(path)).toEqual({
      projects: {
        demo: { url: "https://ms-abc.sfo.meilisearch.io", cloudId: 343 },
        "my-staging": { url: "https://MS-DEF.sfo.meilisearch.io/", apiKey: "search", cloudId: 344 },
        local: { url: "http://localhost:7700" },
        gone: { url: "https://ms-old.sfo.meilisearch.io", cloudId: 1 },
        fresh: { url: "https://ms-ghi.sfo.meilisearch.io", cloudId: 345 },
      },
    });
    expect(readFileSync(path, "utf8")).not.toContain(project.masterKey);
  });

  it("passes --team-id to the API and does not report missing entries then", async () => {
    const { env } = tempConfig("sync-team.json", { other: { url: "https://o", cloudId: 9 } });
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.listProjects([project], received));
    const result = await runCommand(ConfigSyncWithCloud, ["--team-id", "12"], {
      env: { ...managementEnv, ...env },
    });
    expect(result.exitCode).toBe(0);
    expect(received[0]?.url).toBe(`${MANAGEMENT_URL}/api/v2/projects?teamId=12`);
    expect(JSON.parse(result.stdout)).toEqual({
      added: ["demo"],
      updated: [],
      unchanged: [],
      missing: [],
    });
  });

  it("refuses a project whose name the file uses for another URL, and writes nothing", async () => {
    const { path, env } = tempConfig("sync-collision.json", {
      demo: { url: "http://localhost:7700" },
    });
    server.use(managementHandlers.listProjects([project, fresh]));
    const result = await runCommand(ConfigSyncWithCloud, [], { env: { ...managementEnv, ...env } });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "cli_config",
      message: `Project \`demo\` already exists in ${path} with another URL: nothing was written.`,
    });
    expect(readJson(path)).toEqual({ projects: { demo: { url: "http://localhost:7700" } } });
  });
});
