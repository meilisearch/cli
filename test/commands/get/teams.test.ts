import { describe, expect, it } from "vitest";
import GetTeams from "../../../src/commands/get/teams.js";
import {
  managementEnv as env,
  managementHandlers,
  team,
  teamNotFound,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const docs = { ...team, id: 13, name: "Docs" };

describe("meili get teams", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "teams", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("lists the teams in the envelope the API returns, with no paging flag yet", async () => {
    server.use(managementHandlers.listTeams([team, docs]));
    const result = await runCommand(GetTeams, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("gets one team with --id", async () => {
    server.use(managementHandlers.getTeam());
    const result = await runCommand(GetTeams, ["--id", "13", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("passes the API's error body through on an unknown id, with exit 4", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams/999", 404, teamNotFound));
    const result = await runCommand(GetTeams, ["--id", "999", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
