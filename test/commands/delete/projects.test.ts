import { join } from "node:path";
import { describe, expect, it } from "vitest";
import DeleteProjects from "../../../src/commands/delete/projects.js";
import { writeConfigFile } from "../../../src/lib/config.js";
import { managementEnv as env, managementHandlers } from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand, scrubbedHome } from "../../helpers/run-command.js";

useMockServer();

describe("meili delete projects", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["delete", "projects", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("deletes the project of --id and prints nothing", async () => {
    server.use(managementHandlers.deleteProject());
    const result = await runCommand(DeleteProjects, ["--id", "343", "--output", "json"], { env });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("takes the project's cloudId from the config file with --project", async () => {
    const path = join(scrubbedHome, "projects.json");
    writeConfigFile({ path, projects: { staging: { url: "https://s", cloudId: 343 } } });
    server.use(managementHandlers.deleteProject());
    const result = await runCommand(DeleteProjects, ["--project", "staging"], {
      env: { ...env, MEILI_CONFIG: path },
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("maps a 403 to management_forbidden and exit 3", async () => {
    server.use(managementHandlers.apiError("/api/v2/projects/343", 403, { error: "Forbidden" }));
    const result = await runCommand(DeleteProjects, ["--id", "343", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("describes a 403 without a body with the document's description", async () => {
    server.use(managementHandlers.apiError("/api/v2/projects/343", 403));
    const result = await runCommand(DeleteProjects, ["--id", "343"], { env });
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stderr).error.message).toBe("project not accessible");
  });
});
