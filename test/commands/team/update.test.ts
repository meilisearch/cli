import { describe, expect, it } from "vitest";
import TeamUpdate from "../../../src/commands/team/update.js";
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

describe("meili team update", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["team", "update", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("sends the new name and owner for the team of --id, and prints the team updated", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.updateTeam(received));
    const result = await runCommand(
      TeamUpdate,
      ["--id", "12", "--name", "renamed", "--owner-id", "user-2"],
      { env },
    );
    expect(result).toMatchSnapshot();
    expect(received).toMatchObject([
      { url: `${MANAGEMENT_URL}/api/v2/teams/12`, body: { name: "renamed", ownerId: "user-2" } },
    ]);
  });

  it("tells a human in a terminal what it did", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.updateTeam(received));
    const result = await runCommand(
      TeamUpdate,
      ["--id", "12", "--name", "renamed", "--owner-id", "user-2"],
      { env, tty: true },
    );
    expect(result).toMatchSnapshot();
  });

  it("passes the API's error body through on an unknown id, with exit 4", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams/999", 404, teamNotFound));
    const result = await runCommand(TeamUpdate, ["--id", "999", "--name", "renamed"], { env });
    expect(result).toMatchSnapshot();
  });
});
