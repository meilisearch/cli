import { describe, expect, it } from "vitest";
import TaskList from "../../../src/commands/task/list.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const five = [5, 4, 3, 2, 1].map((uid) =>
  makeTask({ uid, status: uid > 3 ? "enqueued" : "succeeded" }),
);

describe("meili task list", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["task", "list", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is in JSON", async () => {
    server.use(meilisearchHandlers.tasks(five));
    const result = await runCommand(TaskList, [...project]);
    expect(result).toMatchSnapshot();
  });

  it("sends every filter as the query parameter of the route, the text as it is", async () => {
    server.use(meilisearchHandlers.tasks(five));
    const requests = await recordRequests(async () => {
      await runCommand(TaskList, [
        "--ids",
        "1,2",
        "--batch-ids",
        "7",
        "--index-ids",
        "movies",
        "--canceled-by",
        "9",
        "--types",
        "documentAdditionOrUpdate,indexDeletion",
        "--statuses",
        "failed,canceled",
        "--before-enqueued-at",
        "2026-01-01T00:00:00Z",
        "--reverse",
        "--limit",
        "2",
        "--from",
        "4",
        ...project,
      ]);
    });
    expect(requests).toHaveLength(1);
    expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({
      uids: "1,2",
      batchUids: "7",
      indexUids: "movies",
      canceledBy: "9",
      types: "documentAdditionOrUpdate,indexDeletion",
      statuses: "failed,canceled",
      beforeEnqueuedAt: "2026-01-01T00:00:00Z",
      reverse: "true",
      limit: "2",
      from: "4",
    });
  });

  it("accepts the API spelling of the identifier flags as an alias", async () => {
    server.use(meilisearchHandlers.tasks(five));
    const requests = await recordRequests(async () => {
      await runCommand(TaskList, ["--uids", "3", "--index-uids", "movies", ...project]);
    });
    expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({
      uids: "3",
      indexUids: "movies",
    });
  });

  it("follows the next cursor with --all and merges every page into one envelope", async () => {
    server.use(meilisearchHandlers.tasks(five));
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(TaskList, ["--all", "--limit", "2", ...project]);
    });
    expect(requests).toBe(3);
    expect(result?.exitCode).toBe(0);
    expect(JSON.parse(result?.stdout ?? "")).toEqual({ results: five, total: 5, next: null });
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/tasks", 403, invalidApiKeyError));
    const result = await runCommand(TaskList, [...project]);
    expect(result).toMatchSnapshot();
  });
});
