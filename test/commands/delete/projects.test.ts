import { describe, expect, it } from "vitest";
import DeleteProjects from "../../../src/commands/delete/projects.js";
import {
  managementEnv as env,
  forbidden,
  managementHandlers,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { readJson, runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

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
      staging: { url: "https://s", cloud: { id: 343 } },
    });
    server.use(managementHandlers.deleteProject());
    const result = await runCommand(DeleteProjects, ["--project", "staging", "--yes"], {
      env: { ...env, ...configEnv },
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("removes the entry with --sync-config: the one --project names, or the one whose cloud.id is --id", async () => {
    server.use(managementHandlers.deleteProject());
    const { path, env: configEnv } = tempConfig("sync-delete.json", {
      staging: { url: "https://s", cloud: { id: 343 } },
      prod: { url: "https://p", cloud: { id: 344 } },
      local: { url: "http://localhost:7700" },
    });
    const named = await runCommand(
      DeleteProjects,
      ["--project", "staging", "--yes", "--sync-config"],
      {
        env: { ...env, ...configEnv },
      },
    );
    expect(named.exitCode).toBe(0);
    const byId = await runCommand(DeleteProjects, ["--id", "344", "--yes", "--sync-config"], {
      env: { ...env, ...configEnv },
    });
    expect(byId.exitCode).toBe(0);
    expect(readJson(path)).toEqual({ projects: { local: { url: "http://localhost:7700" } } });
  });

  it("refuses --sync-config when no entry has the project's cloud id, before any network call", async () => {
    const { path, env: configEnv } = tempConfig("sync-none.json", {
      local: { url: "http://localhost:7700" },
    });
    const result = await runCommand(DeleteProjects, ["--id", "343", "--yes", "--sync-config"], {
      env: { ...env, ...configEnv },
    });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "cli_config",
      message: `No project of ${path} has the cloud id 343: nothing was deleted.`,
      hint: "Run `meili config sync-with-cloud --project-url <url>` first, with the project's URL.",
    });
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
