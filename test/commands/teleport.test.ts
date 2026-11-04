import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Teleport from "../../src/commands/teleport.js";
import type { Resource } from "../../src/lib/clients/management/generated/types.gen.js";
import {
  MANAGEMENT_URL,
  managementEnv,
  managementHandlers,
  project,
  type ReceivedRequest,
  team,
} from "../helpers/management-handlers.js";
import { invalidApiKeyError, MEILISEARCH_URL, makeTask } from "../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../helpers/msw.js";
import { readJson, runCli, runCommand, tempConfig } from "../helpers/run-command.js";

/** The answers the human gives, in order, and the questions the command asked. */
const human = vi.hoisted(() => ({
  answers: [] as unknown[],
  questions: [] as Array<{ message: string; choices?: string[] }>,
}));

vi.mock("../../src/lib/terminal.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/lib/terminal.js")>();
  // A heading of `choose` has no `name`, only its `separator` text.
  const answer = (message: string, choices?: Array<{ name?: string; separator?: string }>) => {
    human.questions.push({
      message,
      ...(choices && { choices: choices.map((c) => c.name ?? c.separator ?? "") }),
    });
    if (human.answers.length === 0) return Promise.reject(new Error(`No answer to: ${message}`));
    return Promise.resolve(human.answers.shift());
  };
  return {
    ...actual,
    choose: (message: string, choices: Array<{ name?: string; separator?: string }>) =>
      answer(message, choices),
    ask: (message: string) => answer(message),
    askSecret: (message: string) => answer(message),
  };
});

/** The latency of each region; Sydney does not answer. */
vi.mock("../../src/lib/clients/ping.js", () => {
  const latencies: Record<string, number> = { "sfo.meilisearch.io": 150, "fra.meilisearch.io": 20 };
  return { regionLatency: (regionUrl: string) => Promise.resolve(latencies[regionUrl]) };
});

useMockServer();

const DASHBOARD_URL = "https://dashboard.test";
const env = { ...managementEnv, MEILI_MANAGEMENT_DASHBOARD_URL: DASHBOARD_URL };
const DESTINATION_URL = project.url as string;

const trial: Resource = { id: 6, name: "free_trial", plan: "free_trial", regionId: 2 };
/** A resource of the region, and the plan the dashboard prices it with. */
function resource(id: number, name: string, kind: string, estimation: number | null): Resource {
  return {
    id,
    name,
    plan: kind === "base" ? "build_plan" : "resource_based_plan",
    regionId: 2,
    vcpu: 2,
    memory: 1,
    storage: 50,
    fullPlan: {
      id,
      name,
      code: name,
      features: [
        { name: "Search", kind: "search", enabled: true, monthlyEstimation: 0 },
        { name, kind, enabled: true, monthlyEstimation: estimation },
      ],
    },
  };
}
/** In the API order: the plans come back sorted XS, M, 2XL; Build is never offered, and L has no price. */
const plans: Resource[] = [
  resource(3, "Build", "base", 30),
  resource(9, "2XL", "instance_runtime", 175.2),
  resource(7, "L", "instance_runtime", null),
  resource(6, "M", "instance_runtime", 43.8),
  resource(4, "XS", "instance_runtime", 21.9),
];
const regions = [
  {
    id: 1,
    name: "San Francisco",
    awsRegion: "us-west-1",
    countryCode: "US",
    regionUrl: "sfo.meilisearch.io",
  },
  {
    id: 2,
    name: "Frankfurt",
    awsRegion: "eu-central-1",
    countryCode: "DE",
    greenLabel: true,
    regionUrl: "fra.meilisearch.io",
  },
  {
    id: 3,
    name: "Sydney",
    awsRegion: "ap-southeast-2",
    countryCode: "AU",
    regionUrl: "syd.meilisearch.io",
  },
];
const [sanFrancisco, frankfurt] = regions;
const missingPayload = {
  message: "A json payload is missing.",
  code: "missing_payload",
  type: "invalid_request",
  link: "https://docs.meilisearch.com/errors#missing_payload",
};

/** The source: `POST /export` without a body is the probe, with one it enqueues task 9. */
function source(received: unknown[] = []) {
  return [
    http.post(`${MEILISEARCH_URL}/export`, async ({ request }) => {
      const text = await request.text();
      if (text === "") return HttpResponse.json(missingPayload, { status: 400 });
      received.push(JSON.parse(text));
      return HttpResponse.json(
        { taskUid: 9, indexUid: null, status: "enqueued", type: "export", enqueuedAt: "" },
        { status: 202 },
      );
    }),
    http.get(`${MEILISEARCH_URL}/tasks/9`, () =>
      HttpResponse.json(makeTask({ uid: 9, status: "succeeded" })),
    ),
  ];
}

/** The new project: three tasks, all processed, and the index `movies`. */
function destination(failed: number[] = []) {
  return [
    http.get(`${DESTINATION_URL}/tasks`, ({ request }) => {
      const statuses = new URL(request.url).searchParams.get("statuses");
      const results =
        statuses === "failed"
          ? failed.map((uid) =>
              makeTask({
                uid,
                status: "failed",
                error: { message: "Bad document.", code: "x", type: "invalid_request", link: "" },
              }),
            )
          : [];
      const total = statuses === null ? 3 : results.length;
      return HttpResponse.json({ results, total, limit: 1, from: null, next: null });
    }),
    http.get(`${DESTINATION_URL}/indexes`, () =>
      HttpResponse.json({
        results: [{ uid: "movies", primaryKey: "id", createdAt: "", updatedAt: "" }],
        offset: 0,
        limit: 1,
        total: 1,
      }),
    ),
  ];
}

/** The Management API of a user with two teams, in a region with a free trial. */
function cloud(
  created: ReceivedRequest[] = [],
  create = managementHandlers.createProject(created),
) {
  const page = (results: unknown[]) =>
    HttpResponse.json({ page: 1, limit: 20, total: results.length, totalPages: 1, results });
  return [
    http.get(`${MANAGEMENT_URL}/api/v2/me`, () =>
      HttpResponse.json({ name: "Ada", email: "ada@example.com" }),
    ),
    http.get(`${MANAGEMENT_URL}/api/v2/regions`, () => page(regions)),
    http.get(`${MANAGEMENT_URL}/api/v2/organizations`, () =>
      page([
        { id: 1, name: "Acme", identifier: "acme" },
        { id: 2, name: "Labs", identifier: "labs" },
      ]),
    ),
    managementHandlers.listTeams([
      team,
      { ...team, id: 14, name: "Research", organizationId: 2 },
      { ...team, id: 13, name: "Other" },
    ]),
    http.get(`${MANAGEMENT_URL}/api/v2/resources`, () => page([...plans, trial])),
    create,
    managementHandlers.getProject([{ ...project, name: "local-cloud" }]),
  ];
}

describe("meili teleport", () => {
  let tty: { stdin: boolean | undefined; stderr: boolean | undefined };
  beforeEach(() => {
    tty = { stdin: process.stdin.isTTY, stderr: process.stderr.isTTY };
    process.stdin.isTTY = true;
    process.stderr.isTTY = true;
    // The spinner stays on its first frame, and every wait lasts 0s.
    vi.useFakeTimers({ toFake: ["setInterval", "Date"] });
    human.answers.length = 0;
    human.questions.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    process.stdin.isTTY = tty.stdin as boolean;
    process.stderr.isTTY = tty.stderr as boolean;
  });

  it("prints its help without any network call", async () => {
    const result = await runCli(["teleport", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("refuses to run without a terminal, with the JSON error and the commands to run instead", async () => {
    process.stdin.isTTY = false as unknown as true;
    process.stderr.isTTY = false as unknown as true;
    const result = await runCommand(Teleport, ["--project", "local"], { env });
    expect(result).toMatchSnapshot();
  });

  it("creates a free trial project, adds it to the config file, and exports the data to it", async () => {
    const exported: unknown[] = [];
    const received: ReceivedRequest[] = [];
    server.use(...source(exported), ...cloud(received), ...destination());
    const { path, env: configEnv } = tempConfig("teleport.json", {
      local: { url: MEILISEARCH_URL, apiKey: "masterKey" },
    });
    human.answers.push(frankfurt, team, "local-cloud");

    const result = await runCommand(Teleport, ["--project", "local"], {
      env: { ...env, ...configEnv },
    });

    expect(result).toMatchSnapshot();
    expect(human.questions).toMatchSnapshot();
    expect(received.map((each) => each.body)).toEqual([
      { name: "local-cloud", teamId: 12, resourceId: 6 },
    ]);
    expect(exported).toEqual([{ url: DESTINATION_URL, apiKey: "projectmasterkey9z8y" }]);
    expect(readJson(path)).toEqual({
      projects: {
        local: { url: MEILISEARCH_URL, apiKey: "masterKey" },
        "local-cloud": {
          url: DESTINATION_URL,
          apiKey: "projectmasterkey9z8y",
          cloud: { id: 343, teamId: 12, teamName: "Search" },
        },
      },
    });
  });

  it("asks for another source when the key cannot export, then offers the plans when the free trial is used, and stops on a missing payment method", async () => {
    const received: ReceivedRequest[] = [];
    const refusals = [
      {
        message: "You already used your free trial.",
        code: "user_not_entitled_to_free_trial",
        type: "invalid_request",
        link: "",
      },
      {
        message: "A payment method is required.",
        code: "project_payment_method_missing",
        type: "invalid_request",
        link: "",
      },
    ];
    server.use(
      http.post(`http://bad.test:7700/export`, () =>
        HttpResponse.json(invalidApiKeyError, { status: 403 }),
      ),
      ...source(),
      ...cloud(
        received,
        http.post(`${MANAGEMENT_URL}/api/v2/projects`, async ({ request }) => {
          received.push({ url: request.url, authorization: null, body: await request.json() });
          return HttpResponse.json(refusals.shift(), { status: 422 });
        }),
      ),
    );
    const { env: configEnv } = tempConfig("teleport-refused.json", {
      bad: { url: "http://bad.test:7700", apiKey: "nope" },
      local: { url: MEILISEARCH_URL, apiKey: "masterKey" },
    });
    human.answers.push("local", sanFrancisco, team, "local-cloud", 4);

    const result = await runCommand(Teleport, ["--project", "bad"], {
      env: { ...env, ...configEnv },
    });

    expect(result).toMatchSnapshot();
    expect(human.questions).toMatchSnapshot();
    expect(received.map((each) => each.body)).toEqual([
      { name: "local-cloud", teamId: 12, resourceId: 6 },
      { name: "local-cloud", teamId: 12, resourceId: 4 },
    ]);
  });

  it("says the transfer goes on, with the links to watch it, on Ctrl-C during the transfer", async () => {
    const exits: Array<{ code: unknown; stderr: string }> = [];
    let stderr = "";
    vi.spyOn(process, "exit").mockImplementationOnce((code) => {
      exits.push({ code, stderr });
      return undefined as never;
    });
    // The first handler of a path wins: this one replaces the task 9 of `source()`.
    server.use(
      http.get(`${MEILISEARCH_URL}/tasks/9`, () => {
        process.emit("SIGINT");
        return HttpResponse.json(makeTask({ uid: 9, status: "succeeded" }));
      }),
      ...source(),
      ...cloud(),
      ...destination(),
    );
    const { env: configEnv } = tempConfig("teleport-interrupted.json", {
      local: { url: MEILISEARCH_URL, apiKey: "masterKey" },
    });
    human.answers.push(frankfurt, team, "local-cloud");

    await runCommand(Teleport, ["--project", "local"], {
      env: { ...env, ...configEnv },
      onStderr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exits.map((each) => each.code)).toEqual([0]);
    expect(exits[0]?.stderr).toMatchSnapshot();
  });

  it("names the failed tasks of the new project, and what exists in Meilisearch Cloud", async () => {
    server.use(...source(), ...cloud(), ...destination([2]));
    const { env: configEnv } = tempConfig("teleport-failed.json", {
      local: { url: MEILISEARCH_URL, apiKey: "masterKey" },
    });
    human.answers.push(frankfurt, team, "local-cloud");

    const result = await runCommand(Teleport, ["--project", "local"], {
      env: { ...env, ...configEnv },
    });

    expect(result.exitCode).toBe(7);
    expect(result.stderr).toMatchSnapshot();
  });
});
