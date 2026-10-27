import { describe, expect, it } from "vitest";
import UpdateProjects from "../../../src/commands/update/projects.js";
import {
  managementEnv as env,
  forbidden,
  MANAGEMENT_URL,
  managementHandlers,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

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
