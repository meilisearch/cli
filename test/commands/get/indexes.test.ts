import { describe, expect, it } from "vitest";
import GetIndexes from "../../../src/commands/get/indexes.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeIndex,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const three = [makeIndex("movies", "id"), makeIndex("books", "isbn"), makeIndex("songs")];
const five = [...three, makeIndex("games", "id"), makeIndex("shows")];

describe("meili get indexes", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "indexes", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is in JSON", async () => {
    server.use(meilisearchHandlers.indexes(three));
    const result = await runCommand(GetIndexes, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("gets one index with --id, as the API returns it", async () => {
    server.use(meilisearchHandlers.index(three));
    const result = await runCommand(GetIndexes, ["--id", "books", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("passes the 404 of an unknown --id through and exits 4", async () => {
    server.use(meilisearchHandlers.index(three));
    const result = await runCommand(GetIndexes, ["--id", "nope", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("ignores the list flags when --id selects the unit route", async () => {
    server.use(meilisearchHandlers.index(three), meilisearchHandlers.indexes(three));
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(
        GetIndexes,
        ["--id", "books", "--limit", "2", "--offset", "1", "--output", "json"],
        { env },
      );
    });
    expect(requests).toBe(1);
    expect(result?.exitCode).toBe(0);
    expect(JSON.parse(result?.stdout ?? "")).toEqual(makeIndex("books", "isbn"));
  });

  it("rejects ndjson with --id, which returns one document", async () => {
    server.use(meilisearchHandlers.index(three));
    const result = await runCommand(GetIndexes, ["--id", "books", "--output", "ndjson"], { env });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });

  it("passes --limit and --offset to the API", async () => {
    server.use(meilisearchHandlers.indexes(five));
    const result = await runCommand(
      GetIndexes,
      ["--limit", "2", "--offset", "1", "--output", "json"],
      {
        env,
      },
    );
    expect(result.exitCode).toBe(0);
    const page = JSON.parse(result.stdout) as {
      results: Array<{ uid: string }>;
      offset: number;
      limit: number;
      total: number;
    };
    expect(page.results.map((index) => index.uid)).toEqual(["books", "songs"]);
    expect(page).toMatchObject({ offset: 1, limit: 2, total: 5 });
  });

  it("prints one item per line in ndjson", async () => {
    server.use(meilisearchHandlers.indexes(three));
    const result = await runCommand(GetIndexes, ["--output", "ndjson"], { env });
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => (JSON.parse(line) as { uid: string }).uid)).toEqual([
      "movies",
      "books",
      "songs",
    ]);
  });

  it("follows every page with --all and merges them into one envelope in JSON", async () => {
    server.use(meilisearchHandlers.indexes(five));
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(GetIndexes, ["--all", "--limit", "2", "--output", "json"], { env });
    });
    expect(requests).toBe(3);
    expect(result?.exitCode).toBe(0);
    expect(JSON.parse(result?.stdout ?? "")).toEqual({ results: five, total: 5 });
  });

  it("streams every page with --all in ndjson", async () => {
    server.use(meilisearchHandlers.indexes(five));
    const result = await runCommand(GetIndexes, ["--all", "--limit", "2", "--output", "ndjson"], {
      env,
    });
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(5);
    expect(lines.map((line) => (JSON.parse(line) as { uid: string }).uid)).toEqual([
      "movies",
      "books",
      "songs",
      "games",
      "shows",
    ]);
  });

  it("handles an empty instance", async () => {
    server.use(meilisearchHandlers.indexes([]));
    expect(await runCommand(GetIndexes, ["--output", "json"], { env })).toEqual({
      stdout: '{"results":[],"offset":0,"limit":20,"total":0}\n',
      stderr: "",
      exitCode: 0,
    });
    expect(await runCommand(GetIndexes, ["--all", "--output", "json"], { env })).toEqual({
      stdout: '{"results":[],"total":0}\n',
      stderr: "",
      exitCode: 0,
    });
    expect(await runCommand(GetIndexes, ["--all", "--output", "ndjson"], { env })).toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/indexes", 403, invalidApiKeyError));
    const result = await runCommand(GetIndexes, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("rejects a non-integer --limit with cli_usage", async () => {
    const result = await runCommand(GetIndexes, ["--limit", "many", "--output", "json"], { env });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });
});
