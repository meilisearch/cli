import { describe, expect, it } from "vitest";
import DeleteTeams from "../../../src/commands/delete/teams.js";
import {
  managementEnv as env,
  managementHandlers,
  teamNotFound,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

describe("meili delete teams", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["delete", "teams", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("deletes the team of --id and prints nothing", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams/12", 204));
    const result = await runCommand(DeleteTeams, ["--id", "12", "--yes", "--output", "json"], {
      env,
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("passes the API's error body through on an unknown id, with exit 4", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams/999", 404, teamNotFound));
    const result = await runCommand(DeleteTeams, ["--id", "999", "--yes", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });
});
