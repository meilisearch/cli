import { describe, expect, it } from "vitest";
import UpdateProjects from "../../../src/commands/update/projects.js";
import {
  managementEnv as env,
  managementHandlers,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

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
