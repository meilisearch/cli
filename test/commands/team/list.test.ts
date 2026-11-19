import { describe, expect, it } from "vitest";
import TeamList from "../../../src/commands/team/list.js";
import {
  managementEnv as env,
  MANAGEMENT_URL,
  managementHandlers,
  type ReceivedRequest,
  team,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const docs = { ...team, id: 13, name: "Docs" };

describe("meili team list", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["team", "list", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("lists the teams in the envelope the API returns", async () => {
    server.use(managementHandlers.listTeams([team, docs]));
    const result = await runCommand(TeamList, [], { env });
    expect(result).toMatchSnapshot();
  });

  it("passes --organization-id to the route", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.listTeams([team, docs], received));
    const result = await runCommand(TeamList, ["--organization-id", "1"], { env });
    expect(result.exitCode).toBe(0);
    expect(received[0]?.url).toBe(`${MANAGEMENT_URL}/api/v2/teams?organizationId=1`);
  });

  it("exits 6 on a 401 without a body", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams", 401));
    const result = await runCommand(TeamList, [], { env });
    expect(result).toMatchSnapshot();
  });
});
