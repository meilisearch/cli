import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import AddDocuments from "../../../src/commands/add/documents.js";
import {
  MEILISEARCH_URL,
  makeEnqueuedTask,
  makeTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const documents = '[{"id":1,"title":"Nosferatu"},{"id":2,"title":"Alien"}]';
const directory = mkdtempSync(join(tmpdir(), "meili-add-documents-"));
const file = join(directory, "movies.json");
writeFileSync(file, documents);

describe("meili add documents", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["add", "documents", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.documentsAdd(makeEnqueuedTask()));
    const result = await runCommand(
      AddDocuments,
      ["--index", "movies", "--data", documents, "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("sends the documents of --file as the body, and the options as query parameters", async () => {
    server.use(meilisearchHandlers.documentsAdd(makeEnqueuedTask()));
    const requests = await recordRequests(async () => {
      await runCommand(
        AddDocuments,
        [
          "--index",
          "movies",
          "--file",
          file,
          "--primary-key",
          "id",
          "--custom-metadata",
          "import-42",
          "--skip-creation",
        ],
        { env },
      );
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url.pathname).toBe("/indexes/movies/documents");
    expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({
      primaryKey: "id",
      customMetadata: "import-42",
      skipCreation: "true",
    });
    expect(JSON.parse(requests[0]?.body ?? "")).toEqual(JSON.parse(documents));
  });

  it("sends no query parameter when no option is given", async () => {
    server.use(meilisearchHandlers.documentsAdd(makeEnqueuedTask()));
    const requests = await recordRequests(async () => {
      await runCommand(AddDocuments, ["--index", "movies", "--data", documents], { env });
    });
    expect(requests[0]?.url.search).toBe("");
  });

  it("refuses to run without documents, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(AddDocuments, ["--index", "movies"], { env });
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_usage");
  });

  it("refuses a file it cannot read, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(
        AddDocuments,
        ["--index", "movies", "--file", join(directory, "absent.json")],
        { env },
      );
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_input_invalid");
  });

  it("polls the task to its final status with --wait", async () => {
    server.use(
      meilisearchHandlers.documentsAdd(makeEnqueuedTask()),
      meilisearchHandlers.taskSequence(42, [
        makeTask({ uid: 42, status: "processing" }),
        makeTask({ uid: 42, status: "succeeded" }),
      ]),
    );
    const result = await runCommand(
      AddDocuments,
      ["--index", "movies", "--data", documents, "--wait", "--output", "json"],
      { env },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid: 42, status: "succeeded" });
  });

  it("prints the final task and exits 7 when the task failed", async () => {
    server.use(
      meilisearchHandlers.documentsAdd(makeEnqueuedTask()),
      meilisearchHandlers.taskSequence(42, [makeTask({ uid: 42, status: "failed" })]),
    );
    const result = await runCommand(
      AddDocuments,
      ["--index", "movies", "--data", documents, "--wait", "--output", "json"],
      { env },
    );
    expect(result.exitCode).toBe(7);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid: 42, status: "failed" });
    expect(JSON.parse(result.stderr).error.code).toBe("cli_task_failed");
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
    const result = await runCommand(
      AddDocuments,
      ["--index", "nope", "--data", documents, "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
