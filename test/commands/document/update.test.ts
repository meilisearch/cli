import { describe, expect, it } from "vitest";
import DocumentUpdate from "../../../src/commands/document/update.js";
import {
  MEILISEARCH_URL,
  makeEnqueuedTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const changes = '[{"id":1,"rating":4}]';

describe("meili document update", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["document", "update", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.documentsUpdate(makeEnqueuedTask()));
    const result = await runCommand(DocumentUpdate, [
      "--index",
      "movies",
      "--data",
      changes,
      ...project,
    ]);
    expect(result).toMatchSnapshot();
  });

  it("takes the PUT route, which merges, and sends the options as query parameters", async () => {
    server.use(meilisearchHandlers.documentsUpdate(makeEnqueuedTask()));
    const requests = await recordRequests(async () => {
      await runCommand(DocumentUpdate, [
        "--index",
        "movies",
        "--data",
        changes,
        "--primary-key",
        "id",
        "--custom-metadata",
        "x",
        ...project,
      ]);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("PUT");
    expect(requests[0]?.url.pathname).toBe("/indexes/movies/documents");
    expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({
      primaryKey: "id",
      customMetadata: "x",
    });
    expect(JSON.parse(requests[0]?.body ?? "")).toEqual(JSON.parse(changes));
  });

  it("refuses to run without documents, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(DocumentUpdate, ["--index", "movies", ...project]);
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_usage");
  });

  it("tells a human in a terminal that the documents keep their old values until the task succeeds", async () => {
    server.use(meilisearchHandlers.documentsUpdate(makeEnqueuedTask()));
    const result = await runCommand(
      DocumentUpdate,
      ["--index", "movies", "--data", '[{"id":1,"rating":4}]', ...project],
      { tty: true },
    );
    expect(result).toMatchSnapshot();
  });

  it("passes the 404 of an unknown index through and exits 4", async () => {
    server.use(
      meilisearchHandlers.apiError("/indexes/nope/documents", 404, {
        message: "Index `nope` not found.",
        code: "index_not_found",
        type: "invalid_request",
        link: "https://docs.meilisearch.com/errors#index_not_found",
      }),
    );
    const result = await runCommand(DocumentUpdate, [
      "--index",
      "nope",
      "--data",
      changes,
      ...project,
    ]);
    expect(result).toMatchSnapshot();
  });
});
