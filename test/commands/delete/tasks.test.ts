import { describe, expect, it } from "vitest";
import DeleteTasks from "../../../src/commands/delete/tasks.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeEnqueuedTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const deleting = makeEnqueuedTask({ taskUid: 8, indexUid: null, type: "taskDeletion" });

describe("meili delete tasks", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["delete", "tasks", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.tasksDelete(deleting));
    const result = await runCommand(
      DeleteTasks,
      ["--ids", "42,1344", "--yes", "--output", "json"],
      {
        env,
      },
    );
    expect(result).toMatchSnapshot();
  });

  it("sends the filters as the query parameters of the route", async () => {
    server.use(meilisearchHandlers.tasksDelete(deleting));
    const requests = await recordRequests(async () => {
      await runCommand(
        DeleteTasks,
        ["--statuses", "succeeded", "--before-enqueued-at", "2026-01-01T00:00:00Z", "--yes"],
        { env },
      );
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("DELETE");
    expect(requests[0]?.url.pathname).toBe("/tasks");
    expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({
      statuses: "succeeded",
      beforeEnqueuedAt: "2026-01-01T00:00:00Z",
    });
  });

  it("refuses to run without --yes, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(DeleteTasks, ["--ids", "42"], { env });
    });
    expect(requests).toBe(0);
    expect(result?.stdout).toBe("");
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_usage");
  });

  it("refuses to run without a filter, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(DeleteTasks, ["--yes", "--output", "json"], { env });
    });
    expect(requests).toBe(0);
    expect(result).toMatchSnapshot();
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/tasks", 403, invalidApiKeyError));
    const result = await runCommand(DeleteTasks, ["--ids", "42", "--yes", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });
});
