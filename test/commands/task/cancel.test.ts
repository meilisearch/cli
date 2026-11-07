import { describe, expect, it } from "vitest";
import TaskCancel from "../../../src/commands/task/cancel.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeEnqueuedTask,
  makeTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const canceling = makeEnqueuedTask({ taskUid: 7, indexUid: null, type: "taskCancelation" });

describe("meili task cancel", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["task", "cancel", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.tasksCancel(canceling));
    const result = await runCommand(TaskCancel, ["--ids", "42,1344", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("tells a human in a terminal what it did", async () => {
    server.use(meilisearchHandlers.tasksCancel(canceling));
    const result = await runCommand(TaskCancel, ["--ids", "42,1344", ...project], { tty: true });
    expect(result).toMatchSnapshot();
  });

  it("sends the filters as the query parameters of the route", async () => {
    server.use(meilisearchHandlers.tasksCancel(canceling));
    const requests = await recordRequests(async () => {
      await runCommand(TaskCancel, [
        "--statuses",
        "enqueued,processing",
        "--index-ids",
        "movies",
        ...project,
      ]);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url.pathname).toBe("/tasks/cancel");
    expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({
      statuses: "enqueued,processing",
      indexUids: "movies",
    });
  });

  it("polls the task to its final status with --wait", async () => {
    server.use(
      meilisearchHandlers.tasksCancel(canceling),
      meilisearchHandlers.taskSequence(7, [
        makeTask({ uid: 7, status: "processing", indexUid: null, type: "taskCancelation" }),
        makeTask({ uid: 7, status: "succeeded", indexUid: null, type: "taskCancelation" }),
      ]),
    );
    const result = await runCommand(TaskCancel, ["--statuses", "enqueued", "--wait", ...project]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid: 7, status: "succeeded" });
  });

  it("lets the API refuse a call without any filter and exits 1", async () => {
    server.use(
      meilisearchHandlers.apiError("/tasks/cancel", 400, {
        message:
          "Query parameters to filter the tasks to cancel are missing. Available query parameters are: `uids`, `indexUids`, `statuses`, `types`, `canceledBy`, `beforeEnqueuedAt`, `afterEnqueuedAt`, `beforeStartedAt`, `afterStartedAt`, `beforeFinishedAt`, `afterFinishedAt`.",
        code: "missing_task_filters",
        type: "invalid_request",
        link: "https://docs.meilisearch.com/errors#missing_task_filters",
      }),
    );
    const result = await runCommand(TaskCancel, [...project]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("missing_task_filters");
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/tasks/cancel", 403, invalidApiKeyError));
    const result = await runCommand(TaskCancel, ["--ids", "42", ...project]);
    expect(result).toMatchSnapshot();
  });
});
