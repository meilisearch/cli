import { describe, expect, it } from "vitest";
import CreateProjects from "../../../src/commands/create/projects.js";
import {
  managementEnv as env,
  MANAGEMENT_TOKEN,
  MANAGEMENT_URL,
  managementHandlers,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { readJson, runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

useMockServer();

describe("meili create projects", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["create", "projects", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("sends the flags as the project body with the token, and prints the project created", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.createProject(received));
    const result = await runCommand(
      CreateProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
    expect(received).toMatchObject([
      {
        authorization: `Bearer ${MANAGEMENT_TOKEN}`,
        body: { name: "demo", teamId: 12, resourceId: 3 },
      },
    ]);
  });

  it("adds the project to the config file with --add-to-config: its URL and cloudId, never its key", async () => {
    server.use(managementHandlers.createProject());
    const { path, env: configEnv } = tempConfig("add-to-config.json", {
      local: { url: "http://localhost:7700" },
    });
    const result = await runCommand(
      CreateProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--add-to-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).id).toBe(343);
    expect(readJson(path)).toEqual({
      projects: {
        local: { url: "http://localhost:7700" },
        demo: { url: "https://ms-abc.sfo.meilisearch.io", cloudId: 343 },
      },
    });
  });

  it("refuses --add-to-config for a name the file has, before any network call", async () => {
    const { path, env: configEnv } = tempConfig("taken.json", {
      demo: { url: "http://elsewhere" },
    });
    const result = await runCommand(
      CreateProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--add-to-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "cli_config",
      message: `Project \`demo\` already exists in ${path}: nothing was created.`,
    });
  });

  it("refuses --project, since none of its routes takes a project", async () => {
    const result = await runCommand(CreateProjects, ["--name", "demo", "--project", "prod"], {
      env,
    });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error).toEqual({
      code: "cli_usage",
      type: "cli",
      message: "`--project` has no use here: none of the routes of this command takes a project.",
    });
  });

  it("takes the body from --data, a flag overriding its field", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.createProject(received));
    const result = await runCommand(
      CreateProjects,
      ["--data", '{"name":"from-data","teamId":12,"resourceId":3}', "--name", "demo"],
      { env },
    );
    expect(result.exitCode).toBe(0);
    expect(received[0]?.body).toEqual({ name: "demo", teamId: 12, resourceId: 3 });
  });

  it("takes the token from --management-token over MEILI_MANAGEMENT_TOKEN", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.createProject(received));
    await runCommand(CreateProjects, ["--name", "demo", "--management-token", "flagToken"], {
      env,
    });
    expect(received[0]?.authorization).toBe("Bearer flagToken");
  });

  it("maps a 403 with the API's error field to management_forbidden and exit 3", async () => {
    server.use(managementHandlers.apiError("/api/v2/projects", 403, { error: "Forbidden" }));
    const result = await runCommand(CreateProjects, ["--name", "demo", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });

  it("fails with cli_auth_missing and exit 3 without a token, before any network call", async () => {
    const result = await runCommand(CreateProjects, ["--name", "demo", "--output", "json"], {
      env: { MEILI_MANAGEMENT_URL: MANAGEMENT_URL },
    });
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_auth_missing");
    expect(result.stderr).not.toContain("MEILI_PROJECT");
  });

  it("reports a connection failure with cli_network and exit 6", async () => {
    server.use(managementHandlers.networkError("/api/v2/projects"));
    const result = await runCommand(CreateProjects, ["--name", "demo"], { env });
    expect(result.exitCode).toBe(6);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_network");
    expect(JSON.parse(result.stderr).error.message).toContain(MANAGEMENT_URL);
  });
});
