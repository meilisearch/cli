import { describe, expect, it } from "vitest";
import TeamView from "../../../src/commands/team/view.js";
import {
  managementEnv as env,
  managementHandlers,
  teamNotFound,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

describe("meili team view", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["team", "view", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("gets one team with --id", async () => {
    server.use(managementHandlers.getTeam());
    const result = await runCommand(TeamView, ["--id", "13"], { env });
    expect(result).toMatchSnapshot();
  });

  it("prints a summary, then every attribute, for a human in a terminal", async () => {
    server.use(managementHandlers.getTeam());
    const result = await runCommand(TeamView, ["--id", "13"], { env, tty: true });
    expect(result).toMatchSnapshot();
  });

  it("passes the API's error body through on an unknown id, with exit 4", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams/999", 404, teamNotFound));
    const result = await runCommand(TeamView, ["--id", "999"], { env });
    expect(result).toMatchSnapshot();
  });
});
