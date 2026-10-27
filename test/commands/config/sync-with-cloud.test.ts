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

  it("sets cloudId by URL on the entries that have one, keeps the rest, never writes a key or an entry", async () => {
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
      stdout: '{"updated":["my-staging"],"unchanged":["demo"],"missing":["gone"]}\n',
      stderr: "",
      exitCode: 0,
    });
    expect(readJson(path)).toEqual({
      projects: {
        demo: { url: "https://ms-abc.sfo.meilisearch.io", cloudId: 343 },
        "my-staging": { url: "https://MS-DEF.sfo.meilisearch.io/", apiKey: "search", cloudId: 344 },
        local: { url: "http://localhost:7700" },
        gone: { url: "https://ms-old.sfo.meilisearch.io", cloudId: 1 },
      },
    });
    expect(readFileSync(path, "utf8")).not.toContain(project.masterKey);
  });

  it("passes --team-id to the API and does not report missing entries then", async () => {
    const { path, env } = tempConfig("sync-team.json", {
      other: { url: "https://o", cloudId: 9 },
      demo: { url: "https://ms-abc.sfo.meilisearch.io" },
    });
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.listProjects([project], received));
    const result = await runCommand(ConfigSyncWithCloud, ["--team-id", "12"], {
      env: { ...managementEnv, ...env },
    });
    expect(result.exitCode).toBe(0);
    expect(received[0]?.url).toBe(`${MANAGEMENT_URL}/api/v2/projects?teamId=12`);
    expect(JSON.parse(result.stdout)).toEqual({ updated: ["demo"], unchanged: [], missing: [] });
    expect(readJson(path)).toEqual({
      projects: {
        other: { url: "https://o", cloudId: 9 },
        demo: { url: "https://ms-abc.sfo.meilisearch.io", cloudId: 343 },
      },
    });
  });
});
