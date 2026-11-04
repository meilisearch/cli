import { describe, expect, it } from "vitest";
import UpdateTeams from "../../../src/commands/update/teams.js";
import {
  managementEnv as env,
  MANAGEMENT_URL,
  managementHandlers,
  type ReceivedRequest,
  teamNotFound,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

describe("meili update teams", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["update", "teams", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("sends the new name and owner for the team of --id, and prints the team updated", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.updateTeam(received));
    const result = await runCommand(
      UpdateTeams,
      ["--id", "12", "--name", "renamed", "--owner-id", "user-2", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
    expect(received).toMatchObject([
      { url: `${MANAGEMENT_URL}/api/v2/teams/12`, body: { name: "renamed", ownerId: "user-2" } },
    ]);
  });

  it("passes the API's error body through on an unknown id, with exit 4", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams/999", 404, teamNotFound));
    const result = await runCommand(
      UpdateTeams,
      ["--id", "999", "--name", "renamed", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
