import { describe, expect, it } from "vitest";
import TeamList from "../../../src/commands/team/list.js";
import {
  managementEnv as env,
  managementHandlers,
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

  it("lists the teams in the envelope the API returns, with no paging flag yet", async () => {
    server.use(managementHandlers.listTeams([team, docs]));
    const result = await runCommand(TeamList, [], { env });
    expect(result).toMatchSnapshot();
  });

  it("exits 6 on a 401 without a body", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams", 401));
    const result = await runCommand(TeamList, [], { env });
    expect(result).toMatchSnapshot();
  });
});
