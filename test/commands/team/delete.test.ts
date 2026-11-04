import { describe, expect, it } from "vitest";
import TeamDelete from "../../../src/commands/team/delete.js";
import {
  managementEnv as env,
  managementHandlers,
  teamNotFound,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

describe("meili team delete", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["team", "delete", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("deletes the team of --id and prints nothing", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams/12", 204));
    const result = await runCommand(TeamDelete, ["--id", "12", "--yes", "--output", "json"], {
      env,
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("passes the API's error body through on an unknown id, with exit 4", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams/999", 404, teamNotFound));
    const result = await runCommand(TeamDelete, ["--id", "999", "--yes", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });
});
