import { describe, expect, it } from "vitest";
import Search from "../../src/commands/search.js";
import {
  indexNotFoundError,
  MEILISEARCH_URL,
  meilisearchHandlers,
} from "../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../helpers/msw.js";
import { runCli, runCommand } from "../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const hits = [{ id: 1, title: "Nosferatu" }];

describe("meili search", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["search", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the search envelope of the API as it is", async () => {
    const received: { body?: unknown } = {};
    server.use(meilisearchHandlers.search(hits, received));
    const result = await runCommand(
      Search,
      ["--index", "movies", "--q", "vampire", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
    expect(received.body).toEqual({ q: "vampire" });
  });

  it("sends every flag as its API field, with the lists split on commas", async () => {
    const received: { body?: unknown } = {};
    server.use(meilisearchHandlers.search(hits, received));
    const result = await runCommand(
      Search,
      [
        "--index",
        "movies",
        "--q",
        "vampire",
        "--filter",
        "year > 1920",
        "--sort",
        "year:asc,title:desc",
        "--limit",
        "5",
        "--offset",
        "10",
        "--facets",
        "genre,year",
        "--attributes-to-retrieve",
        "id,title",
        "--matching-strategy",
        "all",
        "--show-ranking-score",
      ],
      { env },
    );
    expect(result.exitCode).toBe(0);
    expect(received.body).toEqual({
      q: "vampire",
      filter: "year > 1920",
      sort: ["year:asc", "title:desc"],
      limit: 5,
      offset: 10,
      facets: ["genre", "year"],
      attributesToRetrieve: ["id", "title"],
      matchingStrategy: "all",
      showRankingScore: true,
    });
  });

  it("keeps every field of --data, and only the flags given write over it", async () => {
    const received: { body?: unknown } = {};
    server.use(meilisearchHandlers.search(hits, received));
    const body = '{"q":"ghost","limit":3,"hybrid":{"embedder":"default","semanticRatio":0.9}}';
    const hybrid = { embedder: "default", semanticRatio: 0.9 };

    await runCommand(Search, ["--index", "movies", "--data", body, "--q", "vampire"], { env });
    expect(received.body).toEqual({ q: "vampire", limit: 3, hybrid });

    await runCommand(Search, ["--index", "movies", "--data", body], { env });
    expect(received.body).toEqual({ q: "ghost", limit: 3, hybrid });
  });

  it("passes the 404 of an unknown index through and exits 4", async () => {
    server.use(
      meilisearchHandlers.apiError("/indexes/nope/search", 404, indexNotFoundError("nope")),
    );
    const result = await runCommand(
      Search,
      ["--index", "nope", "--q", "vampire", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
