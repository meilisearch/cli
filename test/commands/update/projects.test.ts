import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import UpdateProjects from "../../../src/commands/update/projects.js";
import {
  managementEnv as env,
  forbidden,
  MANAGEMENT_URL,
  managementHandlers,
  project,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { readJson, runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

useMockServer();

describe("meili update projects", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["update", "projects", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("sends the new name for the project of --id, and prints the project updated", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.updateProject(received));
    const result = await runCommand(
      UpdateProjects,
      ["--id", "343", "--name", "renamed", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
    expect(received[0]?.body).toEqual({ name: "renamed" });
  });

  it("takes the project's cloudId from the config file with --project, not with --id too", async () => {
    const { env: configEnv } = tempConfig("projects.json", {
      prod: { url: "https://ms-abc.sfo.meilisearch.io", cloudId: 343 },
    });
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.updateProject(received));
    const named = await runCommand(UpdateProjects, ["--project", "prod", "--name", "renamed"], {
      env: { ...env, ...configEnv },
    });
    expect(named.exitCode).toBe(0);
    expect(received[0]?.url).toBe(`${MANAGEMENT_URL}/api/v2/projects/343`);

    const both = await runCommand(
      UpdateProjects,
      ["--project", "prod", "--id", "343", "--name", "x"],
      { env: { ...env, ...configEnv } },
    );
    expect(both.exitCode).toBe(2);
    expect(JSON.parse(both.stderr).error.code).toBe("cli_usage");
  });

  it("renames the entry with --sync-config: the one --project names, or the one whose cloudId is --id", async () => {
    server.use(managementHandlers.updateProject());
    const { path, env: configEnv } = tempConfig("sync-update.json", {
      local: { url: "http://localhost:7700" },
      prod: { url: "https://ms-abc.sfo.meilisearch.io", apiKey: "k", cloudId: 343 },
    });
    const named = await runCommand(
      UpdateProjects,
      ["--project", "prod", "--name", "renamed", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(named.exitCode).toBe(0);
    const byId = await runCommand(
      UpdateProjects,
      ["--id", "343", "--name", "again", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(byId.exitCode).toBe(0);
    expect(readJson(path)).toEqual({
      projects: {
        local: { url: "http://localhost:7700" },
        again: { url: "https://ms-abc.sfo.meilisearch.io", apiKey: "k", cloudId: 343 },
      },
    });
  });

  it("renames the entry with the name checked, not the one the API answers", async () => {
    server.use(
      http.patch(`${MANAGEMENT_URL}/api/v2/projects/:id`, () =>
        HttpResponse.json({ ...project, name: "taken" }),
      ),
    );
    const { path, env: configEnv } = tempConfig("sync-other-name.json", {
      prod: { url: "https://p", cloudId: 343 },
      taken: { url: "http://elsewhere" },
    });
    const result = await runCommand(
      UpdateProjects,
      ["--project", "prod", "--name", "renamed", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(result.exitCode).toBe(0);
    expect(readJson(path)).toEqual({
      projects: { renamed: { url: "https://p", cloudId: 343 }, taken: { url: "http://elsewhere" } },
    });
  });

  it("refuses --sync-config without a name, or with a name the file has, before any network call", async () => {
    const { path, env: configEnv } = tempConfig("sync-taken.json", {
      prod: { url: "https://p", cloudId: 343 },
      staging: { url: "https://s", cloudId: 344 },
    });
    const noName = await runCommand(UpdateProjects, ["--project", "prod", "--sync-config"], {
      env: { ...env, ...configEnv },
    });
    expect(noName.exitCode).toBe(2);
    expect(JSON.parse(noName.stderr).error.code).toBe("cli_usage");

    const taken = await runCommand(
      UpdateProjects,
      ["--project", "prod", "--name", "staging", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(taken.exitCode).toBe(2);
    expect(JSON.parse(taken.stderr).error).toMatchObject({
      code: "cli_config",
      message: `Project \`staging\` already exists in ${path}: nothing was renamed.`,
    });
  });

  it("passes the API's error body through on a 403, with exit 3", async () => {
    server.use(managementHandlers.apiError("/api/v2/projects/343", 403, forbidden));
    const result = await runCommand(
      UpdateProjects,
      ["--id", "343", "--name", "x", "--output", "json"],
      {
        env,
      },
    );
    expect(result).toMatchSnapshot();
  });
});
