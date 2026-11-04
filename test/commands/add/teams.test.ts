import { describe, expect, it } from "vitest";
import AddTeams from "../../../src/commands/add/teams.js";
import type { Error as ApiError } from "../../../src/lib/clients/management/generated/types.gen.js";
import {
  managementEnv as env,
  MANAGEMENT_TOKEN,
  managementHandlers,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

/** What the API answers to any body it cannot read: no field names the cause. */
const unreadableBody: ApiError = {
  message: "Forbidden.",
  code: "forbidden",
  type: "auth",
  link: "https://www.meilisearch.com/docs/reference/errors#forbidden",
};

describe("meili add teams", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["add", "teams", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("sends the flags as a flat body with the token, and prints the team created", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.createTeam(received));
    const result = await runCommand(
      AddTeams,
      ["--name", "Docs", "--organization-id", "1", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
    expect(received).toMatchObject([
      { authorization: `Bearer ${MANAGEMENT_TOKEN}`, body: { name: "Docs", organizationId: 1 } },
    ]);
  });

  it("passes the API's 403 through on a body it cannot read, with exit 3", async () => {
    server.use(managementHandlers.apiError("/api/v2/teams", 403, unreadableBody));
    const result = await runCommand(AddTeams, ["--name", "Docs", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
