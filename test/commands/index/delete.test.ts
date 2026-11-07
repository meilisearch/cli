import { describe, expect, it } from "vitest";
import IndexDelete from "../../../src/commands/index/delete.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeEnqueuedTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const deleted = makeEnqueuedTask({ taskUid: 13, type: "indexDeletion" });

describe("meili index delete", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["index", "delete", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.indexDelete(deleted));
    const result = await runCommand(IndexDelete, ["--id", "movies", "--yes", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("tells a human in a terminal what it did", async () => {
    server.use(meilisearchHandlers.indexDelete(deleted));
    const result = await runCommand(IndexDelete, ["--id", "movies", "--yes", ...project], {
      tty: true,
    });
    expect(result).toMatchSnapshot();
  });

  it("names the index in the path", async () => {
    server.use(meilisearchHandlers.indexDelete(deleted));
    const requests = await recordRequests(async () => {
      await runCommand(IndexDelete, ["--id", "movies", "--yes", ...project]);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("DELETE");
    expect(requests[0]?.url.pathname).toBe("/indexes/movies");
  });

  it("refuses to run without --yes, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(IndexDelete, ["--id", "movies", ...project]);
    });
    expect(requests).toBe(0);
    expect(result?.stdout).toBe("");
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_usage");
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/indexes/movies", 403, invalidApiKeyError));
    const result = await runCommand(IndexDelete, ["--id", "movies", "--yes", ...project]);
    expect(result).toMatchSnapshot();
  });
});
