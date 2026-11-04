import { describe, expect, it } from "vitest";
import IndexList from "../../../src/commands/index/list.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeIndex,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const three = [makeIndex("movies", "id"), makeIndex("books", "isbn"), makeIndex("songs")];
const five = [...three, makeIndex("games", "id"), makeIndex("shows")];

describe("meili index list", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["index", "list", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is in JSON", async () => {
    server.use(meilisearchHandlers.indexes(three));
    const result = await runCommand(IndexList, ["--output", "json", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("passes --limit and --offset to the API", async () => {
    server.use(meilisearchHandlers.indexes(five));
    const result = await runCommand(IndexList, [
      "--limit",
      "2",
      "--offset",
      "1",
      "--output",
      "json",
      ...project,
    ]);
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
    const result = await runCommand(IndexList, ["--output", "ndjson", ...project]);
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
      result = await runCommand(IndexList, [
        "--all",
        "--limit",
        "2",
        "--output",
        "json",
        ...project,
      ]);
    });
    expect(requests).toBe(3);
    expect(result?.exitCode).toBe(0);
    expect(JSON.parse(result?.stdout ?? "")).toEqual({ results: five, total: 5 });
  });

  it("streams every page with --all in ndjson", async () => {
    server.use(meilisearchHandlers.indexes(five));
    const result = await runCommand(IndexList, [
      "--all",
      "--limit",
      "2",
      "--output",
      "ndjson",
      ...project,
    ]);
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
    expect(await runCommand(IndexList, ["--output", "json", ...project])).toEqual({
      stdout: '{"results":[],"offset":0,"limit":20,"total":0}\n',
      stderr: "",
      exitCode: 0,
    });
    expect(await runCommand(IndexList, ["--all", "--output", "json", ...project])).toEqual({
      stdout: '{"results":[],"total":0}\n',
      stderr: "",
      exitCode: 0,
    });
    expect(await runCommand(IndexList, ["--all", "--output", "ndjson", ...project])).toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/indexes", 403, invalidApiKeyError));
    const result = await runCommand(IndexList, ["--output", "json", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("rejects a non-integer --limit with cli_usage", async () => {
    const result = await runCommand(IndexList, ["--limit", "many", "--output", "json", ...project]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });
});
