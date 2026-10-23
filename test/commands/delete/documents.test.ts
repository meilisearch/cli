import { describe, expect, it } from "vitest";
import DeleteDocuments from "../../../src/commands/delete/documents.js";
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

/** One task per route, so that the output alone says which route answered. */
function useDeleteRoutes(): void {
  server.use(
    meilisearchHandlers.documentsDeleteBatch(
      makeEnqueuedTask({ taskUid: 42, type: "documentDeletion" }),
    ),
    meilisearchHandlers.documentsDeleteByFilter(
      makeEnqueuedTask({ taskUid: 43, type: "documentDeletion" }),
    ),
    meilisearchHandlers.documentsDeleteAll(
      makeEnqueuedTask({ taskUid: 44, type: "documentDeletion" }),
    ),
  );
}

/** The one request the CLI sent, as `METHOD /path body`, and what it printed. */
async function sentAndPrinted(
  argv: string[],
): Promise<{ sent: string; printed: Awaited<ReturnType<typeof runCommand>> | undefined }> {
  let printed: Awaited<ReturnType<typeof runCommand>> | undefined;
  const requests = await recordRequests(async () => {
    printed = await runCommand(DeleteDocuments, argv, { env });
  });
  expect(requests).toHaveLength(1);
  const request = requests[0];
  return {
    sent: `${request?.method} ${request?.url.pathname} ${request?.body}`.trimEnd(),
    printed,
  };
}

/** Runs the command and asserts that nothing was sent. */
async function usageErrorOf(argv: string[]): Promise<{ code: string; exitCode: number }> {
  let result: Awaited<ReturnType<typeof runCommand>> | undefined;
  const requests = await countRequests(async () => {
    result = await runCommand(DeleteDocuments, argv, { env });
  });
  expect(requests).toBe(0);
  expect(result?.stdout).toBe("");
  return {
    code: (JSON.parse(result?.stderr ?? "") as { error: { code: string } }).error.code,
    exitCode: result?.exitCode ?? 0,
  };
}

describe("meili delete documents", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["delete", "documents", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("takes the delete-batch route with --ids, and prints the task it answered", async () => {
    useDeleteRoutes();
    const { sent, printed } = await sentAndPrinted([
      "--index",
      "movies",
      "--ids",
      "42,1344",
      "--yes",
      "--output",
      "json",
    ]);
    expect(sent).toBe('POST /indexes/movies/documents/delete-batch ["42","1344"]');
    expect(printed).toMatchSnapshot();
  });

  it("takes the delete route with --filter, and prints the task it answered", async () => {
    useDeleteRoutes();
    const { sent, printed } = await sentAndPrinted([
      "--index",
      "movies",
      "--filter",
      "rating < 2",
      "--yes",
      "--output",
      "json",
    ]);
    expect(sent).toBe('POST /indexes/movies/documents/delete {"filter":"rating < 2"}');
    expect(printed).toMatchSnapshot();
  });

  it("takes the route that deletes every document with --all, and prints the task it answered", async () => {
    useDeleteRoutes();
    const { sent, printed } = await sentAndPrinted([
      "--index",
      "movies",
      "--all",
      "--yes",
      "--output",
      "json",
    ]);
    expect(sent).toBe("DELETE /indexes/movies/documents");
    expect(printed).toMatchSnapshot();
  });

  it("accepts --id as the name of --ids", async () => {
    useDeleteRoutes();
    const { sent } = await sentAndPrinted(["--index", "movies", "--id", "42", "--yes"]);
    expect(sent).toBe('POST /indexes/movies/documents/delete-batch ["42"]');
  });

  it("reads the selector from --data, whose shape chooses the route", async () => {
    useDeleteRoutes();
    expect((await sentAndPrinted(["--index", "movies", "--data", "[42,1344]", "--yes"])).sent).toBe(
      "POST /indexes/movies/documents/delete-batch [42,1344]",
    );
    const byFilter = await sentAndPrinted([
      "--index",
      "movies",
      "--data",
      '{"filter":[["genres = horror","genres = scifi"]]}',
      "--yes",
    ]);
    expect(byFilter.sent).toBe(
      'POST /indexes/movies/documents/delete {"filter":[["genres = horror","genres = scifi"]]}',
    );
  });

  it("lets --ids override the identifiers of the body", async () => {
    useDeleteRoutes();
    const { sent } = await sentAndPrinted([
      "--index",
      "movies",
      "--data",
      "[1,2]",
      "--ids",
      "42",
      "--yes",
    ]);
    expect(sent).toBe('POST /indexes/movies/documents/delete-batch ["42"]');
  });

  it("sends --custom-metadata as a query parameter", async () => {
    useDeleteRoutes();
    const requests = await recordRequests(async () => {
      await runCommand(
        DeleteDocuments,
        ["--index", "movies", "--all", "--custom-metadata", "cleanup", "--yes"],
        { env },
      );
    });
    expect(requests[0]?.url.searchParams.get("customMetadata")).toBe("cleanup");
  });

  it("refuses to run without --yes, before any network call", async () => {
    expect(await usageErrorOf(["--index", "movies", "--ids", "42"])).toEqual({
      code: "cli_usage",
      exitCode: 2,
    });
  });

  it("refuses to run without a selector, before any network call", async () => {
    expect(await usageErrorOf(["--index", "movies", "--yes"])).toEqual({
      code: "cli_usage",
      exitCode: 2,
    });
  });

  it("refuses two selectors that call for two different routes", async () => {
    for (const argv of [
      ["--index", "movies", "--ids", "42", "--filter", "rating < 2", "--yes"],
      ["--index", "movies", "--all", "--ids", "42", "--yes"],
      ["--index", "movies", "--all", "--data", "[42]", "--yes"],
      ["--index", "movies", "--data", "[42]", "--filter", "rating < 2", "--yes"],
    ]) {
      expect(await usageErrorOf(argv), argv.join(" ")).toEqual({
        code: "cli_usage",
        exitCode: 2,
      });
    }
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(
      meilisearchHandlers.apiError(
        "/indexes/movies/documents/delete-batch",
        403,
        invalidApiKeyError,
      ),
    );
    const result = await runCommand(
      DeleteDocuments,
      ["--index", "movies", "--ids", "42", "--yes", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
