import { existsSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import AuthStatus from "../../src/commands/auth/status.js";
import Health from "../../src/commands/health.js";
import {
  flagNames,
  identify,
  resetAnonymousId,
  sendAnalytics,
  track,
} from "../../src/lib/analytics.js";
import { type Api, BaseCommand } from "../../src/lib/base-command.js";
import { ANALYTICS_URL } from "../../src/lib/clients/analytics.js";
import { DEFAULT_MANAGEMENT_URL as CLOUD } from "../../src/lib/config.js";
import MeiliHelp from "../../src/lib/help.js";
import { choose } from "../../src/lib/terminal.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../helpers/meilisearch-handlers.js";
import { countRequests, server, useMockServer } from "../helpers/msw.js";
import { loadConfig, readJson, runCli, runCommand, scrubbedHome } from "../helpers/run-command.js";
import { storeSession } from "../helpers/session.js";

const select = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", async (importActual) => ({
  ...(await importActual<typeof import("@inquirer/prompts")>()),
  select,
}));

useMockServer();

interface Batch {
  api_key: string;
  batch: Array<{ event: string; distinct_id: string; properties: Record<string, unknown> }>;
}

/** Records every batch PostHog receives. */
function posthog(): Batch[] {
  const batches: Batch[] = [];
  server.use(
    http.post(`${ANALYTICS_URL}/batch/`, async ({ request }) => {
      batches.push((await request.json()) as Batch);
      return HttpResponse.json({ status: 1 });
    }),
  );
  return batches;
}

/** Analytics on, with a config directory of its own, so that each test starts without an id. */
function analyticsEnv(overrides: Record<string, string> = {}): Record<string, string | undefined> {
  const dir = mkdtempSync(join(scrubbedHome, "analytics-"));
  return { MEILI_NO_ANALYTICS: undefined, MEILI_CONFIG: join(dir, "config.json"), ...overrides };
}

const health = ["--project-url", MEILISEARCH_URL];

describe("analytics", () => {
  it("sends one cli_command_run with the names of the flags, never their values", async () => {
    server.use(meilisearchHandlers.indexes([]));
    const batches = posthog();
    // Through oclif, which gives the command its id, `index:list`.
    const result = await runCli(["index", "list", ...health], { env: analyticsEnv() });

    expect(result).toEqual({
      stdout: '{"results":[],"offset":0,"limit":20,"total":0}\n',
      stderr: "",
      exitCode: 0,
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]?.api_key).toMatch(/^phc_/);
    expect(batches[0]?.batch).toEqual([
      {
        event: "cli_command_run",
        distinct_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        timestamp: expect.any(String),
        properties: expect.objectContaining({
          command: "index list",
          flags: ["project-url"],
          exit_code: 0,
          site: "cli",
          $process_person_profile: false,
        }),
      },
    ]);
    expect(JSON.stringify(batches)).not.toContain("meili.test");
  });

  it("keeps the anonymous id in analytics.json, and shows the notice once", async () => {
    server.use(meilisearchHandlers.health());
    const batches = posthog();
    const env = analyticsEnv();
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    const first = await runCommand(Health, health, { env });
    const second = await runCommand(Health, health, { env });
    Object.defineProperty(process.stderr, "isTTY", { value: undefined, configurable: true });

    const file = readJson(join(dirname(env.MEILI_CONFIG as string), "analytics.json"));
    expect(file).toEqual({ anonymousId: batches[0]?.batch[0]?.distinct_id });
    expect(batches[1]?.batch[0]?.distinct_id).toBe(batches[0]?.batch[0]?.distinct_id);
    expect(first.stderr).toContain("To turn it off, set MEILI_NO_ANALYTICS=true.");
    expect(second.stderr).toBe("");
  });

  it("reports the error code and the exit code of a failed command", async () => {
    server.use(
      meilisearchHandlers.apiError("/health", 500, {
        message: "An internal error has occurred.",
        code: "internal",
        type: "internal",
        link: "https://docs.meilisearch.com/errors#internal",
      }),
    );
    const batches = posthog();
    const result = await runCommand(Health, health, { env: analyticsEnv() });

    expect(result.exitCode).toBe(1);
    expect(batches[0]?.batch[0]?.properties).toMatchObject({
      exit_code: 1,
      error_code: "internal",
    });
  });

  it.each<Record<string, string>>([
    { MEILI_NO_ANALYTICS: "true" },
    { MEILI_NO_ANALYTICS: "1" },
    { DO_NOT_TRACK: "1" },
    { CI: "true" },
    { CI: "" },
    { MEILI_MANAGEMENT_URL: "https://staging.test" },
  ])("sends nothing and writes no id with %o", async (overrides) => {
    server.use(meilisearchHandlers.health());
    const env = analyticsEnv(overrides);
    const requests = await countRequests(() => runCommand(Health, health, { env }));

    expect(requests).toBe(1);
    expect(existsSync(join(dirname(env.MEILI_CONFIG as string), "analytics.json"))).toBe(false);
  });

  it("leaves the command unchanged when PostHog cannot be reached", async () => {
    server.use(
      meilisearchHandlers.health(),
      http.post(`${ANALYTICS_URL}/batch/`, () => HttpResponse.error()),
    );
    const result = await runCommand(Health, health, { env: analyticsEnv() });

    expect(result).toEqual({ stdout: '{"status":"available"}\n', stderr: "", exitCode: 0 });
  });

  it("sends the events of a command that exits from a signal handler", async () => {
    const batches = posthog();
    const exit = vi.spyOn(process, "exit").mockImplementationOnce(() => undefined as never);
    class Interrupted extends BaseCommand {
      static api: Api = "none";
      async run(): Promise<void> {
        track("cli_prompt_answered", { prompt: "region", choice: "Europe (Frankfurt)" });
        await this.exitNow(130);
      }
    }
    await runCommand(Interrupted, [], { env: analyticsEnv() });

    expect(exit).toHaveBeenCalledWith(130);
    expect(batches[0]?.batch.map((event) => [event.event, event.properties])).toEqual([
      ["cli_prompt_answered", expect.objectContaining({ prompt: "region" })],
      ["cli_command_run", expect.objectContaining({ exit_code: 130 })],
    ]);
  });

  it("joins the anonymous id to the Cloud user after login, and uses the user's id while the session exists", async () => {
    server.use(meilisearchHandlers.health());
    const batches = posthog();
    const env = analyticsEnv();
    await runCommand(Health, health, { env });
    const anonymous = batches[0]?.batch[0]?.distinct_id;

    const userId = await identify(env, CLOUD, async () => "user-uuid");
    storeSession(env, CLOUD, { userId });
    await sendAnalytics(env, { command: "auth login" });
    await runCommand(Health, health, { env });

    expect(userId).toBe("user-uuid");
    expect(batches[1]?.batch[0]).toMatchObject({
      event: "$identify",
      distinct_id: "user-uuid",
      properties: { $anon_distinct_id: anonymous },
    });
    expect(batches[2]?.batch[0]?.distinct_id).toBe("user-uuid");
    expect(batches[2]?.batch[0]?.properties).not.toHaveProperty("$process_person_profile");
  });

  it("stays anonymous when the user's id cannot be fetched", async () => {
    const batches = posthog();
    const env = analyticsEnv();
    const userId = await identify(env, CLOUD, () => Promise.reject(new Error("offline")));
    await sendAnalytics(env, { command: "auth login" });

    expect(userId).toBeUndefined();
    expect(batches.flatMap((batch) => batch.batch)).toEqual([]);
  });

  it("never identifies the user of a session of another Cloud", async () => {
    const batches = posthog();
    const env = analyticsEnv();
    const userId = await identify(env, "https://staging.test", async () => "user-uuid");
    await sendAnalytics(env, { command: "auth status" });

    expect(userId).toBeUndefined();
    expect(batches.flatMap((batch) => batch.batch)).toEqual([]);
  });

  it("identifies, in auth status, a session that has no user yet, and stores the user", async () => {
    server.use(
      http.get(`${CLOUD}/oauth/token/info`, () => HttpResponse.json({ scope: ["read", "write"] })),
      http.get(`${CLOUD}/api/v2/me`, () =>
        HttpResponse.json({ id: "user-uuid", name: "Ada", email: "ada@example.com" }),
      ),
    );
    const batches = posthog();
    const env = analyticsEnv();
    const path = storeSession(env, CLOUD);
    const result = await runCommand(AuthStatus, [], { env });

    expect(result.exitCode).toBe(0);
    expect(readJson(path)).toMatchObject({ userId: "user-uuid" });
    expect(batches[0]?.batch.map((event) => [event.event, event.distinct_id])).toEqual([
      ["$identify", "user-uuid"],
      ["cli_command_run", "user-uuid"],
    ]);
  });

  it("gives a new anonymous id after logout", async () => {
    server.use(meilisearchHandlers.health());
    const batches = posthog();
    const env = analyticsEnv();
    await runCommand(Health, health, { env });
    resetAnonymousId(env);
    await runCommand(Health, health, { env });

    expect(batches[1]?.batch[0]?.distinct_id).not.toBe(batches[0]?.batch[0]?.distinct_id);
  });

  it("records which help shows, never what was typed", async () => {
    const batches = posthog();
    const help = new MeiliHelp(await loadConfig());
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await help.showHelp([]);
    await help.showHelp(["index", "--help"]);
    await help.showHelp(["index", "view", "--id", "movies", "--help"]);
    write.mockRestore();
    await sendAnalytics(analyticsEnv(), { cli_version: "1.0.0" });

    expect(batches[0]?.batch.map((event) => [event.event, event.properties])).toEqual([
      ["cli_help_shown", expect.objectContaining({ site: "cli" })],
      ["cli_help_shown", expect.objectContaining({ topic: "index" })],
      ["cli_help_shown", expect.objectContaining({ command: "index view" })],
    ]);
    expect(batches[0]?.batch[0]?.properties).not.toHaveProperty("command");
    expect(batches[0]?.batch[0]?.properties).not.toHaveProperty("topic");
    expect(JSON.stringify(batches)).not.toContain("movies");
  });

  it("sends nothing when no event was collected", async () => {
    const batches = posthog();
    await sendAnalytics(analyticsEnv(), { cli_version: "1.0.0" });
    expect(batches).toEqual([]);
  });

  it("names only the flags the command declares", () => {
    const flags = { index: { char: "i" }, browser: { allowNo: true }, q: {} };
    expect(
      flagNames(["-i", "movies", "--no-browser", "--q=--secret", "--secret", "--q"], flags),
    ).toEqual(["index", "no-browser", "q"]);
  });

  it("records the id of the option chosen, and the question left with Ctrl-C", async () => {
    const batches = posthog();
    const choices = [
      { name: "Europe (Frankfurt)", value: 2, id: "Europe (Frankfurt)" },
      { name: "My team", value: 7 },
    ];
    select.mockResolvedValueOnce(2).mockResolvedValueOnce(7);
    await choose("region", "Region of the new project", choices);
    await choose("team", "Team of the new project", choices);
    select.mockRejectedValueOnce(Object.assign(new Error("left"), { name: "ExitPromptError" }));
    await expect(choose("plan", "Plan of the new project", choices)).rejects.toThrow("left");
    await sendAnalytics(analyticsEnv(), { command: "teleport" });

    expect(batches[0]?.batch.map((event) => [event.event, event.properties])).toEqual([
      [
        "cli_prompt_answered",
        expect.objectContaining({
          command: "teleport",
          prompt: "region",
          choice: "Europe (Frankfurt)",
        }),
      ],
      ["cli_prompt_answered", expect.objectContaining({ prompt: "team" })],
      ["cli_prompt_aborted", expect.objectContaining({ prompt: "plan" })],
    ]);
    expect(batches[0]?.batch[1]?.properties).not.toHaveProperty("choice");
  });
});
