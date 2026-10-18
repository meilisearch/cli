import { describe, expect, it } from "vitest";
import GetTasks from "../../../src/commands/get/tasks.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
// The API returns the most recent task first, so the uids go down.
const five = [12, 11, 10, 9, 8].map((uid) =>
  makeTask({ uid, status: uid % 2 === 0 ? "succeeded" : "failed" }),
);

describe("meili get tasks", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "tasks", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is", async () => {
    server.use(meilisearchHandlers.tasks(five.slice(0, 2)));
    const result = await runCommand(GetTasks, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("sends every filter as its API query parameter", async () => {
    const received: { query?: Record<string, string> } = {};
    server.use(meilisearchHandlers.tasks(five, received));
    const result = await runCommand(
      GetTasks,
      [
        "--ids",
        "11,12",
        "--statuses",
        "failed,canceled",
        "--types",
        "documentAdditionOrUpdate",
        "--index-ids",
        "movies,books",
        "--batch-ids",
        "7",
        "--reverse",
        "--after-enqueued-at",
        "2026-09-24T10:00:00Z",
        "--limit",
        "2",
      ],
      { env },
    );
    expect(result.exitCode).toBe(0);
    expect(received.query).toEqual({
      uids: "11,12",
      statuses: "failed,canceled",
      types: "documentAdditionOrUpdate",
      indexUids: "movies,books",
      batchUids: "7",
      reverse: "true",
      afterEnqueuedAt: "2026-09-24T10:00:00Z",
      limit: "2",
    });
  });

  it("accepts --id and the API spellings as aliases of --ids", async () => {
    const received: { query?: Record<string, string> } = {};
    server.use(meilisearchHandlers.tasks(five, received));
    await runCommand(GetTasks, ["--id", "42"], { env });
    expect(received.query).toEqual({ uids: "42" });
    await runCommand(GetTasks, ["--uids", "42", "--index-uids", "movies"], { env });
    expect(received.query).toEqual({ uids: "42", indexUids: "movies" });
  });

  it("refuses an identifier that is not a number, before any call", async () => {
    const result = await runCommand(GetTasks, ["--ids", "42,nope"], { env });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    const { error } = JSON.parse(result.stderr) as { error: { code: string; message: string } };
    expect(error.code).toBe("cli_usage");
    expect(error.message).toContain("`nope`");
  });

  it("follows the next cursor with --all and merges the pages into one envelope", async () => {
    server.use(meilisearchHandlers.tasks(five));
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(GetTasks, ["--all", "--limit", "2", "--output", "json"], { env });
    });
    expect(requests).toBe(3);
    const page = JSON.parse(result?.stdout ?? "") as {
      results: Array<{ uid: number }>;
      total: number;
    };
    expect(page.results.map((task) => task.uid)).toEqual([12, 11, 10, 9, 8]);
    expect(page.total).toBe(5);
    expect(page).not.toHaveProperty("from");
    expect(page).not.toHaveProperty("next");
  });

  it("passes an authentication error through and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/tasks", 403, invalidApiKeyError));
    const result = await runCommand(GetTasks, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
