import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import AddProjects from "../../../src/commands/add/projects.js";
import { writeConfigFile } from "../../../src/lib/config.js";
import {
  managementEnv as env,
  forbidden,
  MANAGEMENT_TOKEN,
  MANAGEMENT_URL,
  managementHandlers,
  project,
  type ReceivedRequest,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { readJson, runCli, runCommand, tempConfig } from "../../helpers/run-command.js";

useMockServer();

describe("meili add projects", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["add", "projects", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("sends the flags as the project body with the token, and prints the project created", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.createProject(received));
    const result = await runCommand(
      AddProjects,
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

  it("adds the project to the config file with --sync-config: its URL, its master key and its cloud identifiers", async () => {
    server.use(managementHandlers.createProject(), managementHandlers.listTeams());
    const { path, env: configEnv } = tempConfig("sync-config.json", {
      local: { url: "http://localhost:7700" },
    });
    const result = await runCommand(
      AddProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).id).toBe(343);
    expect(readJson(path)).toEqual({
      projects: {
        local: { url: "http://localhost:7700" },
        demo: {
          url: "https://ms-abc.sfo.meilisearch.io",
          apiKey: "projectmasterkey9z8y",
          cloud: { id: 343, teamId: 12, teamName: "Search" },
        },
      },
    });
  });

  it("names the entry with the name checked, not the one the API answers", async () => {
    server.use(
      http.post(`${MANAGEMENT_URL}/api/v2/projects`, () =>
        HttpResponse.json({ ...project, name: "taken" }, { status: 201 }),
      ),
      managementHandlers.listTeams(),
    );
    const { path, env: configEnv } = tempConfig("sync-other-name.json", {
      taken: { url: "http://elsewhere" },
    });
    const result = await runCommand(
      AddProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(result.exitCode).toBe(0);
    expect(readJson(path)).toEqual({
      projects: {
        taken: { url: "http://elsewhere" },
        demo: {
          url: project.url,
          apiKey: project.masterKey,
          cloud: { id: 343, teamId: 12, teamName: "Search" },
        },
      },
    });
  });

  it("writes the entry without teamName, with a warning, when the team names cannot be read", async () => {
    server.use(
      managementHandlers.createProject(),
      managementHandlers.apiError("/api/v2/teams", 403, forbidden),
    );
    const { path, env: configEnv } = tempConfig("sync-no-team.json", {});
    const result = await runCommand(
      AddProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stderr).warning).toMatchObject({
      code: "project_not_accessible",
      message:
        "The team names could not be read, the entries are written without teamName: You cannot access this project.",
    });
    expect(readJson(path)).toEqual({
      projects: {
        demo: { url: project.url, apiKey: project.masterKey, cloud: { id: 343, teamId: 12 } },
      },
    });
  });

  it("points to config sync-with-cloud when the project created has no URL yet", async () => {
    server.use(
      http.post(`${MANAGEMENT_URL}/api/v2/projects`, () =>
        HttpResponse.json({ ...project, url: null }, { status: 201 }),
      ),
    );
    const { path, env: configEnv } = tempConfig("sync-no-url.json", {});
    const result = await runCommand(
      AddProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(JSON.parse(result.stdout).masterKey).toBe("****9z8y");
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "cli_config",
      hint: "Run `meili config sync-with-cloud --project-name demo` once `meili get projects --id 343` shows its URL: it adds the project with its master key.",
    });
    expect(readJson(path)).toEqual({ projects: {} });
  });

  it("refuses --sync-config for a name the file has, before any network call", async () => {
    const { path, env: configEnv } = tempConfig("taken.json", {
      demo: { url: "http://elsewhere" },
    });
    const result = await runCommand(
      AddProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "cli_config",
      message: `Project \`demo\` already exists in ${path}: nothing was created.`,
    });
  });

  /** `project` as `GET /api/v2/projects/{id}` returns it: only creation returns the master key. */
  const { masterKey: _, ...polled } = project;

  /** `POST /api/v2/projects` answering a project being created, without URL yet, and `GET /api/v2/projects/343` answering `statuses` in turn, the last one repeated. */
  function creation(...statuses: string[]) {
    let polls = 0;
    return [
      http.post(`${MANAGEMENT_URL}/api/v2/projects`, () =>
        HttpResponse.json({ ...project, url: null, status: "creating" }, { status: 201 }),
      ),
      http.get(`${MANAGEMENT_URL}/api/v2/projects/343`, () => {
        const status = statuses[Math.min(polls++, statuses.length - 1)];
        return HttpResponse.json(
          status === "running" ? { ...polled, status } : { ...polled, url: null, status },
        );
      }),
    ];
  }

  it("polls the project with --wait until running, and prints it as the API returns it, without master key", async () => {
    server.use(...creation("creating", "running"));
    const result = await runCommand(
      AddProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--wait", "--output", "json"],
      { env },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(polled);
  });

  it("adds the project to the config file with --wait --sync-config, once its URL is known", async () => {
    server.use(...creation("running"), managementHandlers.listTeams());
    const { path, env: configEnv } = tempConfig("wait-sync.json", {});
    const result = await runCommand(
      AddProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--wait", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(result.exitCode).toBe(0);
    expect(readJson(path)).toEqual({
      projects: {
        demo: {
          url: project.url,
          apiKey: project.masterKey,
          cloud: { id: 343, teamId: 12, teamName: "Search" },
        },
      },
    });
  });

  it("keeps what another command wrote to the config file during --wait", async () => {
    const { path, env: configEnv } = tempConfig("wait-concurrent.json", {});
    server.use(
      http.post(`${MANAGEMENT_URL}/api/v2/projects`, () => {
        writeConfigFile({ path, projects: { other: { url: "http://other" } } });
        return HttpResponse.json({ ...project, url: null, status: "creating" }, { status: 201 });
      }),
      http.get(`${MANAGEMENT_URL}/api/v2/projects/343`, () => HttpResponse.json(polled)),
      managementHandlers.listTeams(),
    );
    const result = await runCommand(
      AddProjects,
      ["--name", "demo", "--team-id", "12", "--resource-id", "3", "--wait", "--sync-config"],
      { env: { ...env, ...configEnv } },
    );
    expect(result.exitCode).toBe(0);
    expect(Object.keys((readJson(path) as { projects: object }).projects)).toEqual([
      "other",
      "demo",
    ]);
  });

  it("prints the project and exits 7 with cli_task_failed when its status becomes failed", async () => {
    server.use(...creation("failed"));
    const { path, env: configEnv } = tempConfig("wait-failed.json", {});
    const result = await runCommand(
      AddProjects,
      [
        "--name",
        "demo",
        "--team-id",
        "12",
        "--resource-id",
        "3",
        "--wait",
        "--sync-config",
        "--output",
        "json",
      ],
      { env: { ...env, ...configEnv } },
    );
    expect(result.exitCode).toBe(7);
    expect(JSON.parse(result.stdout)).toEqual({ ...polled, url: null, status: "failed" });
    expect(JSON.parse(result.stderr).error).toEqual({
      code: "cli_task_failed",
      type: "cli",
      message: `Project 343 finished with status failed, so it was not added to ${path}.`,
    });
    expect(readJson(path)).toEqual({ projects: {} });
  });

  it("fails with cli_timeout and exit 5 when the project is not running within --timeout", async () => {
    server.use(...creation("creating"));
    const result = await runCommand(
      AddProjects,
      ["--name", "demo", "--wait", "--timeout", "50ms", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("offers no --project: the route creates a project rather than reaching one", async () => {
    const result = await runCommand(AddProjects, ["--name", "demo", "--project", "prod"], {
      env,
    });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "cli_usage",
      type: "cli",
      message: "Nonexistent flag: --project",
    });
  });

  it("takes the body from --data, a flag overriding its field", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.createProject(received));
    const result = await runCommand(
      AddProjects,
      ["--data", '{"name":"from-data","teamId":12,"resourceId":3}', "--name", "demo"],
      { env },
    );
    expect(result.exitCode).toBe(0);
    expect(received[0]?.body).toEqual({ name: "demo", teamId: 12, resourceId: 3 });
  });

  it("takes the token from --management-token over MEILI_MANAGEMENT_TOKEN", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.createProject(received));
    await runCommand(AddProjects, ["--name", "demo", "--management-token", "flagToken"], {
      env,
    });
    expect(received[0]?.authorization).toBe("Bearer flagToken");
  });

  it("passes the API's error body through on a 403, with exit 3", async () => {
    server.use(managementHandlers.apiError("/api/v2/projects", 403, forbidden));
    const result = await runCommand(AddProjects, ["--name", "demo", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });

  it("fails with cli_auth_missing and exit 3 without a token, before any network call", async () => {
    const result = await runCommand(AddProjects, ["--name", "demo", "--output", "json"], {
      env: { MEILI_MANAGEMENT_URL: MANAGEMENT_URL },
    });
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_auth_missing");
    expect(result.stderr).not.toContain("MEILI_PROJECT");
  });

  it("reports a connection failure with cli_network and exit 6", async () => {
    server.use(managementHandlers.networkError("/api/v2/projects"));
    const result = await runCommand(AddProjects, ["--name", "demo"], { env });
    expect(result.exitCode).toBe(6);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_network");
    expect(JSON.parse(result.stderr).error.message).toContain(MANAGEMENT_URL);
  });
});
