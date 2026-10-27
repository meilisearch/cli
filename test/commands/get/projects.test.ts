import { describe, expect, it } from "vitest";
import GetProjects from "../../../src/commands/get/projects.js";
import {
  managementEnv as env,
  MANAGEMENT_URL,
  managementHandlers,
  project,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

useMockServer();

const staging = { ...project, id: 344, name: "staging", url: "https://ms-def.sfo.meilisearch.io" };

describe("meili get projects", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "projects", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("lists the projects in the envelope the API returns, with no paging flag yet", async () => {
    server.use(managementHandlers.listProjects([project, staging]));
    const result = await runCommand(GetProjects, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("passes --team-id to the list route, and prints one project per line in ndjson", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.listProjects([project, staging], received));
    const result = await runCommand(GetProjects, ["--team-id", "12", "--output", "ndjson"], {
      env,
    });
    expect(result.exitCode).toBe(0);
    expect(received[0]?.url).toBe(`${MANAGEMENT_URL}/api/v2/projects?teamId=12`);
    expect(result.stdout).toBe(`${JSON.stringify(project)}\n${JSON.stringify(staging)}\n`);
  });

  it("gets one project with --id, or with --project and its cloudId", async () => {
    server.use(managementHandlers.getProject([project, staging]));
    const byId = await runCommand(GetProjects, ["--id", "344", "--output", "json"], { env });
    expect(byId).toEqual({ stdout: `${JSON.stringify(staging)}\n`, stderr: "", exitCode: 0 });

    const { env: configEnv } = tempConfig("projects.json", {
      demo: { url: "https://ms-abc.sfo.meilisearch.io", cloudId: 343 },
    });
    const byName = await runCommand(GetProjects, ["--project", "demo", "--output", "json"], {
      env: { ...env, ...configEnv },
    });
    expect(byName.stdout).toBe(`${JSON.stringify(project)}\n`);
  });

  it("passes the API's error body through on an unknown id, with exit 3", async () => {
    server.use(managementHandlers.getProject([project]));
    const result = await runCommand(GetProjects, ["--id", "999", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
