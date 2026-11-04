import { describe, expect, it } from "vitest";
import GetOrganizations from "../../../src/commands/get/organizations.js";
import {
  managementEnv as env,
  managementHandlers,
  organization,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const other = { ...organization, id: 2, name: "Beta", identifier: "beta", isAdmin: false };

describe("meili get organizations", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "organizations", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("lists the organizations in the envelope the API returns, with no paging flag yet", async () => {
    server.use(managementHandlers.listOrganizations([organization, other]));
    const result = await runCommand(GetOrganizations, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("gets one organization with --id", async () => {
    server.use(managementHandlers.getOrganization([organization, other]));
    const result = await runCommand(GetOrganizations, ["--id", "2", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("passes the API's error body through on an organization it does not show, with exit 3", async () => {
    server.use(managementHandlers.getOrganization([organization]));
    const result = await runCommand(GetOrganizations, ["--id", "999", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });
});
