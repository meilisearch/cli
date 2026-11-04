import { describe, expect, it } from "vitest";
import UpdateOrganizations from "../../../src/commands/update/organizations.js";
import {
  managementEnv as env,
  forbidden,
  MANAGEMENT_URL,
  managementHandlers,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

describe("meili update organizations", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["update", "organizations", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("sends the new name for the organization of --id, and prints the organization updated", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.updateOrganization(received));
    const result = await runCommand(
      UpdateOrganizations,
      ["--id", "1", "--name", "Renamed", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
    expect(received[0]?.url).toBe(`${MANAGEMENT_URL}/api/v2/organizations/1`);
    expect(received[0]?.body).toEqual({ name: "Renamed" });
  });

  it("passes the API's error body through on a 403, with exit 3", async () => {
    server.use(managementHandlers.apiError("/api/v2/organizations/1", 403, forbidden));
    const result = await runCommand(
      UpdateOrganizations,
      ["--id", "1", "--name", "x", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
