import { describe, expect, it } from "vitest";
import ProjectView from "../../../src/commands/project/view.js";
import {
  managementEnv as env,
  managementHandlers,
  project,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

useMockServer();

const staging = { ...project, id: 344, name: "staging", url: "https://ms-def.sfo.meilisearch.io" };

describe("meili project view", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["project", "view", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("gets one project with --id, or with --project and its cloud.id", async () => {
    server.use(managementHandlers.getProject([project, staging]));
    const byId = await runCommand(ProjectView, ["--id", "344"], { env });
    expect(byId).toMatchSnapshot();

    const { env: configEnv } = tempConfig("projects.json", {
      demo: { url: "https://ms-abc.sfo.meilisearch.io", cloud: { id: 343 } },
    });
    const byName = await runCommand(ProjectView, ["--project", "demo"], {
      env: { ...env, ...configEnv },
    });
    expect(byName.stdout).toBe(`${JSON.stringify(project)}\n`);
  });

  it("prints the project for a human in a terminal, and compact JSON with --json or MEILI_JSON", async () => {
    server.use(managementHandlers.getProject([project, staging]));
    const human = await runCommand(ProjectView, ["--id", "344"], {
      env: env,
      tty: true,
    });
    expect(human).toMatchSnapshot();

    const colored = await runCommand(ProjectView, ["--id", "344"], {
      env: { ...env, NO_COLOR: undefined },
      tty: true,
    });
    expect(colored.stdout).toContain("\x1b[");
    const noColor = await runCommand(ProjectView, ["--id", "344", "--no-color"], {
      env,
      tty: true,
    });
    expect(noColor.stdout).toBe(human.stdout);

    const json = `${JSON.stringify(staging)}\n`;
    const flag = await runCommand(ProjectView, ["--id", "344", "--json"], { env, tty: true });
    expect(flag.stdout).toBe(json);
    const variable = await runCommand(ProjectView, ["--id", "344"], {
      env: { ...env, MEILI_JSON: "1" },
      tty: true,
    });
    expect(variable.stdout).toBe(json);
  });

  it("writes an error as text for a human in a terminal", async () => {
    server.use(managementHandlers.getProject([project]));
    const result = await runCommand(ProjectView, ["--id", "999"], {
      env: env,
      tty: true,
    });
    expect(result).toMatchSnapshot();
  });

  it("passes the API's error body through on an unknown id, with exit 3", async () => {
    server.use(managementHandlers.getProject([project]));
    const result = await runCommand(ProjectView, ["--id", "999"], { env });
    expect(result).toMatchSnapshot();
  });
});
