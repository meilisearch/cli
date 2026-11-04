import { describe, expect, it } from "vitest";
import OrganizationList from "../../../src/commands/organization/list.js";
import {
  managementEnv as env,
  managementHandlers,
  organization,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const other = { ...organization, id: 2, name: "Beta", identifier: "beta", isAdmin: false };

describe("meili organization list", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["organization", "list", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("lists the organizations in the envelope the API returns, with no paging flag yet", async () => {
    server.use(managementHandlers.listOrganizations([organization, other]));
    const result = await runCommand(OrganizationList, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("exits 6 on a 401 without a body", async () => {
    server.use(managementHandlers.apiError("/api/v2/organizations", 401));
    const result = await runCommand(OrganizationList, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
