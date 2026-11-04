import { describe, expect, it } from "vitest";
import ProjectView from "../../../src/commands/project/view.js";
import {
  managementEnv as env,
  managementHandlers,
  project,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

useMockServer();

const staging = { ...project, id: 344, name: "staging", url: "https://ms-def.sfo.meilisearch.io" };

describe("meili project view", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["project", "view", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("gets one project with --id, or with --project and its cloud.id", async () => {
    server.use(managementHandlers.getProject([project, staging]));
    const byId = await runCommand(ProjectView, ["--id", "344", "--output", "json"], { env });
    expect(byId).toMatchSnapshot();

    const { env: configEnv } = tempConfig("projects.json", {
      demo: { url: "https://ms-abc.sfo.meilisearch.io", cloud: { id: 343 } },
    });
    const byName = await runCommand(ProjectView, ["--project", "demo", "--output", "json"], {
      env: { ...env, ...configEnv },
    });
    expect(byName.stdout).toBe(`${JSON.stringify(project)}\n`);
  });

  it("passes the API's error body through on an unknown id, with exit 3", async () => {
    server.use(managementHandlers.getProject([project]));
    const result = await runCommand(ProjectView, ["--id", "999", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
