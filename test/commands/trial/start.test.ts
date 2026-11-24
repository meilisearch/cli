import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import TrialStart from "../../../src/commands/trial/start.js";
import type {
  Project,
  Region,
  Resource,
} from "../../../src/lib/clients/management/generated/types.gen.js";
import {
  MANAGEMENT_URL,
  managementEnv,
  managementHandlers,
  project,
  type ReceivedRequest,
  region,
  team,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { STUB_USER } from "../../helpers/oauth-server.js";
import { readJson, runCli, runCommand, tempConfig } from "../../helpers/run-command.js";
import { sessionHome, storeSession } from "../../helpers/session.js";

/** The latency of each region; Sydney does not answer. */
vi.mock("../../../src/lib/clients/ping.js", () => {
  const latencies: Record<string, number> = { "sfo.meilisearch.io": 150, "fra.meilisearch.io": 20 };
  return { regionLatency: (regionUrl: string) => Promise.resolve(latencies[regionUrl]) };
});

/** The browser login stores the session that the human would approve. */
const login = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../../../src/lib/login.js", async () => {
  const { storeSession } = await import("../../helpers/session.js");
  const { MANAGEMENT_URL } = await import("../../helpers/management-handlers.js");
  return {
    logInWithBrowser: (env: Record<string, string | undefined>) => {
      login.calls++;
      storeSession(env, MANAGEMENT_URL);
      return Promise.resolve();
    },
  };
});

useMockServer();

const DASHBOARD_URL = "https://dashboard.test";
const env = { ...managementEnv, MEILI_MANAGEMENT_DASHBOARD_URL: DASHBOARD_URL };
/** A credentials file of its own and no token: the session of `auth login` is what connects. */
const sessionEnv = () => ({
  ...sessionHome(),
  MEILI_MANAGEMENT_URL: MANAGEMENT_URL,
  MEILI_MANAGEMENT_DASHBOARD_URL: DASHBOARD_URL,
});

const frankfurt: Region = { ...region, id: 2, name: "Frankfurt", regionUrl: "fra.meilisearch.io" };
const sydney: Region = { ...region, id: 3, name: "Sydney", regionUrl: "syd.meilisearch.io" };
const trialOf = (regionId: number): Resource => ({
  id: 10 + regionId,
  name: "free_trial",
  plan: "free_trial",
  regionId,
});
const resources: Resource[] = [
  { id: 3, name: "build", plan: "build_plan", regionId: 2 },
  trialOf(1),
  trialOf(2),
  trialOf(3),
];
/** The trial project once it runs, as `GET /api/v2/projects/{id}` returns it: no master key. */
const { masterKey: _masterKey, ...running } = project;
const trialProject: Project = {
  ...running,
  name: "my-app",
  resourceId: 12,
  freeTrialEndsAt: "2026-12-08T17:00:00Z",
  resource: { id: 12, name: "free_trial", plan: "free_trial", regionId: 2 },
};

/** What a new account answers: its user, one team, no project, the regions and their resources. */
function newAccount(received: ReceivedRequest[] = [], projects: Project[] = []) {
  server.use(
    http.get(`${MANAGEMENT_URL}/api/v2/me`, () => HttpResponse.json(STUB_USER)),
    managementHandlers.listTeams(),
    managementHandlers.listProjects(projects),
    managementHandlers.listRegions([region, frankfurt, sydney]),
    managementHandlers.listResources(resources),
    http.post(`${MANAGEMENT_URL}/api/v2/projects`, async ({ request }) => {
      received.push({ url: request.url, authorization: null, body: await request.json() });
      return HttpResponse.json(
        { ...trialProject, status: "creating", url: null, masterKey: "trialmasterkey1234" },
        { status: 201 },
      );
    }),
    managementHandlers.getProject([trialProject]),
  );
}

describe("meili trial start", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["trial", "start", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("creates a free trial project in the closest region, waits until it runs, and adds it to the config file", async () => {
    const received: ReceivedRequest[] = [];
    newAccount(received);
    const { path, env: configEnv } = tempConfig("trial-new.json", {});
    const result = await runCommand(TrialStart, ["--name", "my-app"], {
      env: { ...env, ...configEnv },
    });
    expect(result).toMatchSnapshot();
    expect(received.map((each) => each.body)).toEqual([
      { name: "my-app", teamId: 12, resourceId: 12 },
    ]);
    expect(readJson(path)).toEqual({
      projects: {
        "my-app": {
          url: trialProject.url,
          apiKey: "trialmasterkey1234",
          cloud: { id: 343, teamId: 12, teamName: "Search" },
        },
      },
    });
  });

  it("tells a human what it did, the end of the trial and what to run next", async () => {
    newAccount();
    const { env: configEnv } = tempConfig("trial-human.json", {});
    const result = await runCommand(TrialStart, ["--name", "my-app", "--region-id", "1"], {
      env: { ...env, ...configEnv },
      tty: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatchSnapshot();
  });

  it("names the project after the current directory without --name", async () => {
    const received: ReceivedRequest[] = [];
    newAccount(received);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue("/home/ada/a-search-app");
    const { env: configEnv } = tempConfig("trial-cwd.json", {});
    try {
      await runCommand(TrialStart, [], { env: { ...env, ...configEnv } });
    } finally {
      cwd.mockRestore();
    }
    expect(received[0]?.body).toMatchObject({ name: "a-search-app" });
  });

  it("returns the free trial project that exists with created false, and creates nothing", async () => {
    const received: ReceivedRequest[] = [];
    newAccount(received, [{ ...running, id: 1 }, trialProject]);
    server.use(managementHandlers.masterKey([trialProject]));
    const { path, env: configEnv } = tempConfig("trial-existing.json", {
      "my-app": { url: "http://localhost:7700" },
    });
    const result = await runCommand(TrialStart, ["--name", "other"], {
      env: { ...env, ...configEnv },
    });
    expect(result.exitCode).toBe(0);
    expect(received).toEqual([]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      created: false,
      configProject: "my-app-343",
      project: { id: 343, name: "my-app" },
    });
    expect(readJson(path)).toMatchObject({
      projects: { "my-app-343": { url: trialProject.url, apiKey: "masterKey-343" } },
    });
  });

  it("refuses to choose a team for an account with several", async () => {
    newAccount();
    server.use(managementHandlers.listTeams([team, { ...team, id: 13, name: "Other" }]));
    const result = await runCommand(TrialStart, ["--name", "my-app"], { env });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchSnapshot();
  });

  it("passes the error of a used free trial through, with the next step", async () => {
    newAccount();
    server.use(
      http.post(`${MANAGEMENT_URL}/api/v2/projects`, () =>
        HttpResponse.json(
          {
            message: "You are not entitled to a free trial.",
            code: "user_not_entitled_to_free_trial",
            type: "invalid_request",
            link: "https://www.meilisearch.com/docs/reference/errors#user_not_entitled_to_free_trial",
          },
          { status: 403 },
        ),
      ),
    );
    const result = await runCommand(TrialStart, ["--name", "my-app"], { env });
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stderr)).toMatchSnapshot();
  });

  it("fails with cli_task_failed when the project fails", async () => {
    newAccount();
    server.use(managementHandlers.getProject([{ ...trialProject, status: "failed" }]));
    const { env: configEnv } = tempConfig("trial-failed.json", {});
    const result = await runCommand(TrialStart, ["--name", "my-app"], {
      env: { ...env, ...configEnv },
    });
    expect(result.exitCode).toBe(7);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_task_failed");
  });

  it("fails with cli_auth_missing and no browser with --no-login when nobody is logged in", async () => {
    const calls = login.calls;
    const result = await runCommand(TrialStart, ["--no-login"], {
      env: sessionEnv(),
    });
    expect(result.exitCode).toBe(3);
    expect(login.calls).toBe(calls);
    expect(JSON.parse(result.stderr)).toMatchSnapshot();
  });

  it("logs in with the browser when nobody is logged in, then creates the project", async () => {
    newAccount();
    const calls = login.calls;
    const result = await runCommand(TrialStart, ["--name", "my-app"], { env: sessionEnv() });
    expect(result.exitCode).toBe(0);
    expect(login.calls).toBe(calls + 1);
    expect(JSON.parse(result.stdout).created).toBe(true);
  });

  it("uses the stored session without a login", async () => {
    newAccount();
    const calls = login.calls;
    const home = sessionEnv();
    storeSession(home, MANAGEMENT_URL);
    const result = await runCommand(TrialStart, ["--name", "my-app"], { env: home });
    expect(result.exitCode).toBe(0);
    expect(login.calls).toBe(calls);
    expect(JSON.parse(result.stdout).created).toBe(true);
  });
});
