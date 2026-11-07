import { describe, expect, it } from "vitest";
import OrganizationView from "../../../src/commands/organization/view.js";
import {
  managementEnv as env,
  managementHandlers,
  organization,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const other = { ...organization, id: 2, name: "Beta", identifier: "beta", isAdmin: false };

describe("meili organization view", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["organization", "view", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("gets one organization with --id", async () => {
    server.use(managementHandlers.getOrganization([organization, other]));
    const result = await runCommand(OrganizationView, ["--id", "2"], { env });
    expect(result).toMatchSnapshot();
  });

  it("prints a summary, then every attribute, for a human in a terminal", async () => {
    server.use(managementHandlers.getOrganization([organization, other]));
    const result = await runCommand(OrganizationView, ["--id", "2"], { env, tty: true });
    expect(result).toMatchSnapshot();
  });

  it("passes the API's error body through on an organization it does not show, with exit 3", async () => {
    server.use(managementHandlers.getOrganization([organization]));
    const result = await runCommand(OrganizationView, ["--id", "999"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });
});
