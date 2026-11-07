import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import DocumentAdd from "../../../src/commands/document/add.js";
import {
  MEILISEARCH_URL,
  makeEnqueuedTask,
  makeTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const documents = '[{"id":1,"title":"Nosferatu"},{"id":2,"title":"Alien"}]';
const directory = mkdtempSync(join(tmpdir(), "meili-add-documents-"));
const file = join(directory, "movies.json");
writeFileSync(file, documents);

describe("meili document add", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["document", "add", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.documentsAdd(makeEnqueuedTask()));
    const result = await runCommand(DocumentAdd, [
      "--index",
      "movies",
      "--data",
      documents,
      ...project,
    ]);
    expect(result).toMatchSnapshot();
  });

  it("sends the documents of --file as the body, and the options as query parameters", async () => {
    server.use(meilisearchHandlers.documentsAdd(makeEnqueuedTask()));
    const requests = await recordRequests(async () => {
      await runCommand(DocumentAdd, [
        "--index",
        "movies",
        "--file",
        file,
        "--primary-key",
        "id",
        "--custom-metadata",
        "import-42",
        "--skip-creation",
        ...project,
      ]);
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
      await runCommand(DocumentAdd, ["--index", "movies", "--data", documents, ...project]);
    });
    expect(requests[0]?.url.search).toBe("");
  });

  it("refuses to run without documents, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(DocumentAdd, ["--index", "movies", ...project]);
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_usage");
  });

  it("refuses a file it cannot read, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(DocumentAdd, [
        "--index",
        "movies",
        "--file",
        join(directory, "absent.json"),
        ...project,
      ]);
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
    const result = await runCommand(DocumentAdd, [
      "--index",
      "movies",
      "--data",
      documents,
      "--wait",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid: 42, status: "succeeded" });
  });

  it.each([
    ["tells a human how to follow the task", true],
    ["writes nothing more without a human", false],
  ])("exits 130 on Ctrl-C during --wait, and %s", async (_, tty) => {
    let exit: { code: unknown; stderr: string } | undefined;
    let stderr = "";
    vi.spyOn(process, "exit").mockImplementationOnce((code) => {
      exit = { code, stderr };
      return undefined as never;
    });
    server.use(
      meilisearchHandlers.documentsAdd(makeEnqueuedTask()),
      http.get(`${MEILISEARCH_URL}/tasks/42`, () => {
        process.emit("SIGINT");
        return HttpResponse.json(makeTask({ uid: 42, status: "succeeded" }));
      }),
    );
    await runCommand(
      DocumentAdd,
      ["--index", "movies", "--data", documents, "--wait", ...project],
      {
        tty,
        onStderr: (chunk) => {
          stderr += chunk;
        },
      },
    );
    expect(exit).toMatchSnapshot();
  });

  it("exits 130 without an error when the last poll fails after Ctrl-C", async () => {
    vi.spyOn(process, "exit").mockImplementationOnce(() => undefined as never);
    server.use(
      meilisearchHandlers.documentsAdd(makeEnqueuedTask()),
      http.get(`${MEILISEARCH_URL}/tasks/42`, () => {
        process.emit("SIGINT");
        return HttpResponse.error();
      }),
    );
    const result = await runCommand(DocumentAdd, [
      "--index",
      "movies",
      "--data",
      documents,
      "--wait",
      ...project,
    ]);
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 130 });
  });

  it("prints the final task and exits 7 when the task failed", async () => {
    server.use(
      meilisearchHandlers.documentsAdd(makeEnqueuedTask()),
      meilisearchHandlers.taskSequence(42, [makeTask({ uid: 42, status: "failed" })]),
    );
    const result = await runCommand(DocumentAdd, [
      "--index",
      "movies",
      "--data",
      documents,
      "--wait",
      ...project,
    ]);
    expect(result.exitCode).toBe(7);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid: 42, status: "failed" });
    expect(JSON.parse(result.stderr).error.code).toBe("cli_task_failed");
  });

  it("tells a human in a terminal what the task will do, then what it did with --wait", async () => {
    const human = { tty: true };
    server.use(meilisearchHandlers.documentsAdd(makeEnqueuedTask()));
    const enqueued = await runCommand(
      DocumentAdd,
      ["--index", "movies", "--data", documents, ...project],
      human,
    );
    expect(enqueued).toMatchSnapshot();

    server.use(
      meilisearchHandlers.taskSequence(42, [
        makeTask({
          uid: 42,
          status: "succeeded",
          type: "documentAdditionOrUpdate",
          details: { receivedDocuments: 2, indexedDocuments: 2 },
          duration: "PT1.204S",
          startedAt: "2026-09-24T10:00:00Z",
          finishedAt: "2026-09-24T10:00:01Z",
        }),
      ]),
    );
    const succeeded = await runCommand(
      DocumentAdd,
      ["--index", "movies", "--data", documents, "--wait", ...project],
      human,
    );
    expect(succeeded.exitCode).toBe(0);
    expect(succeeded.stdout).toMatchSnapshot();
    expect(succeeded.stderr).toContain(
      "✓ Task 42 succeeded: 2 of 2 documents added to index movies.",
    );
  });

  it("writes the error of a failed task first for a human, once, and exits 7", async () => {
    server.use(
      meilisearchHandlers.documentsAdd(makeEnqueuedTask()),
      meilisearchHandlers.taskSequence(42, [
        makeTask({
          uid: 42,
          status: "failed",
          type: "documentAdditionOrUpdate",
          error: {
            message: "The primary key of index `movies` is missing.",
            code: "index_primary_key_no_candidate_found",
            type: "invalid_request",
            link: "https://docs.meilisearch.com/errors#index_primary_key_no_candidate_found",
          },
        }),
      ]),
    );
    const result = await runCommand(
      DocumentAdd,
      ["--index", "movies", "--data", documents, "--wait", ...project],
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
    const result = await runCommand(DocumentAdd, [
      "--index",
      "nope",
      "--data",
      documents,
      ...project,
    ]);
    expect(result).toMatchSnapshot();
  });
});
