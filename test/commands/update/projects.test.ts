import { join } from "node:path";
import { describe, expect, it } from "vitest";
import UpdateProjects from "../../../src/commands/update/projects.js";
import { writeConfigFile } from "../../../src/lib/config.js";
import {
  managementEnv as env,
  MANAGEMENT_URL,
  managementHandlers,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand, scrubbedHome } from "../../helpers/run-command.js";

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
    expect(received[0]?.body).toEqual({ project: { name: "renamed" } });
  });

  it("takes the project's cloudId from the config file with --project", async () => {
    const path = join(scrubbedHome, "projects.json");
    writeConfigFile({
      path,
      projects: {
        prod: { url: "https://ms-abc.sfo.meilisearch.io", cloudId: 343 },
        local: { url: "http://l" },
      },
    });
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.updateProject(received));
    const named = await runCommand(UpdateProjects, ["--project", "prod", "--name", "renamed"], {
      env: { ...env, MEILI_CONFIG: path },
    });
    expect(named.exitCode).toBe(0);
    expect(received[0]?.url).toBe(`${MANAGEMENT_URL}/api/v2/projects/343`);

    const noCloudId = await runCommand(UpdateProjects, ["--project", "local", "--name", "x"], {
      env: { ...env, MEILI_CONFIG: path },
    });
    expect(noCloudId.exitCode).toBe(2);
    expect(JSON.parse(noCloudId.stderr).error.code).toBe("cli_config");
    expect(JSON.parse(noCloudId.stderr).error.hint).toContain("config sync-with-cloud");

    const both = await runCommand(
      UpdateProjects,
      ["--project", "prod", "--id", "343", "--name", "x"],
      { env: { ...env, MEILI_CONFIG: path } },
    );
    expect(both.exitCode).toBe(2);
    expect(JSON.parse(both.stderr).error.code).toBe("cli_usage");

    const neither = await runCommand(UpdateProjects, ["--name", "x"], { env });
    expect(neither.exitCode).toBe(2);
    expect(JSON.parse(neither.stderr).error.message).toBe(
      "Name the project with `--id <id>` or `--project <name>`.",
    );
  });

  it("maps a 403 to management_forbidden and exit 3", async () => {
    server.use(managementHandlers.apiError("/api/v2/projects/343", 403, { error: "Forbidden" }));
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
