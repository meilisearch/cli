import { describe, expect, it } from "vitest";
import DeleteOrganizations from "../../../src/commands/delete/organizations.js";
import { managementEnv as env, managementHandlers } from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

/** The 422 of the document when the organization still has a project. */
const hasProjects = {
  message: "The organization still has projects. Delete them first.",
  code: "organization_has_projects",
  type: "invalid_request",
  link: "https://www.meilisearch.com/docs/reference/errors#organization_has_projects",
};

describe("meili delete organizations", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["delete", "organizations", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("deletes the organization of --id and prints nothing", async () => {
    server.use(managementHandlers.deleteOrganization());
    const result = await runCommand(
      DeleteOrganizations,
      ["--id", "1", "--yes", "--output", "json"],
      { env },
    );
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("passes the API's error body through when the organization has projects, with exit 1", async () => {
    server.use(managementHandlers.apiError("/api/v2/organizations/1", 422, hasProjects));
    const result = await runCommand(
      DeleteOrganizations,
      ["--id", "1", "--yes", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
