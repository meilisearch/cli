import { describe, expect, it } from "vitest";
import ProjectList from "../../../src/commands/project/list.js";
import {
  managementEnv as env,
  MANAGEMENT_URL,
  managementHandlers,
  project,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const staging = { ...project, id: 344, name: "staging", url: "https://ms-def.sfo.meilisearch.io" };

describe("meili project list", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["project", "list", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("lists the projects in the envelope the API returns, with no paging flag yet", async () => {
    server.use(managementHandlers.listProjects([project, staging]));
    const result = await runCommand(ProjectList, [], { env });
    expect(result).toMatchSnapshot();
  });

  it("passes --team-id to the list route", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.listProjects([project, staging], received));
    const result = await runCommand(ProjectList, ["--team-id", "12"], { env });
    expect(result.exitCode).toBe(0);
    expect(received[0]?.url).toBe(`${MANAGEMENT_URL}/api/v2/projects?teamId=12`);
  });

  it("exits 6 on a 401 without a body", async () => {
    server.use(managementHandlers.apiError("/api/v2/projects", 401));
    const result = await runCommand(ProjectList, [], { env });
    expect(result).toMatchSnapshot();
  });
});
