import { describe, expect, it } from "vitest";
import DeleteProjects from "../../../src/commands/delete/projects.js";
import {
  managementEnv as env,
  forbidden,
  managementHandlers,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

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
    const result = await runCommand(DeleteProjects, ["--id", "343", "--yes", "--output", "json"], {
      env,
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("takes the project's cloudId from the config file with --project", async () => {
    const { env: configEnv } = tempConfig("projects.json", {
      staging: { url: "https://s", cloudId: 343 },
    });
    server.use(managementHandlers.deleteProject());
    const result = await runCommand(DeleteProjects, ["--project", "staging", "--yes"], {
      env: { ...env, ...configEnv },
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("passes the API's error body through on a 403, with exit 3", async () => {
    server.use(managementHandlers.apiError("/api/v2/projects/343", 403, forbidden));
    const result = await runCommand(DeleteProjects, ["--id", "343", "--yes", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });

  it("calls a 403 without an error body a network error, not the API speaking", async () => {
    server.use(managementHandlers.apiError("/api/v2/projects/343", 403));
    const result = await runCommand(DeleteProjects, ["--id", "343", "--yes"], { env });
    expect(result.exitCode).toBe(6);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_network");
  });
});
