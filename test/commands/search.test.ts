import { describe, expect, it } from "vitest";
import Search from "../../src/commands/search.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../helpers/msw.js";
import { runCli, runCommand } from "../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const hits = [
  { id: 1, title: "Nosferatu", rating: 4.5 },
  { id: 2, title: "Nosferatu the Vampyre", rating: 4 },
];

/** The body the CLI sent to POST /indexes/{uid}/search, request by request. */
async function bodiesOf(argv: string[]): Promise<unknown[]> {
  const requests = await recordRequests(async () => {
    await runCommand(Search, argv, { env });
  });
  return requests.map((request) => JSON.parse(request.body));
}

describe("meili search", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["search", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is in JSON", async () => {
    server.use(meilisearchHandlers.search(hits));
    const result = await runCommand(
      Search,
      ["--index", "movies", "--q", "nosferatu", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("sends the search parameters in the body of the route", async () => {
    server.use(meilisearchHandlers.search(hits));
    const bodies = await bodiesOf([
      "--index",
      "movies",
      "--q",
      "nosferatu",
      "--filter",
      "rating > 4",
      "--sort",
      "rating:desc",
      "--facets",
      "genres",
      "--attributes-to-retrieve",
      "id,title",
      "--matching-strategy",
      "all",
      "--ranking-score-threshold",
      "0.7",
      "--vector",
      "0.1,0.2",
      "--hybrid",
      '{"embedder":"default","semanticRatio":0.5}',
      "--show-ranking-score",
      "--limit",
      "2",
      "--offset",
      "1",
    ]);
    expect(bodies).toEqual([
      {
        q: "nosferatu",
        filter: "rating > 4",
        sort: ["rating:desc"],
        facets: ["genres"],
        attributesToRetrieve: ["id", "title"],
        matchingStrategy: "all",
        rankingScoreThreshold: 0.7,
        vector: [0.1, 0.2],
        hybrid: { embedder: "default", semanticRatio: 0.5 },
        showRankingScore: true,
        limit: 2,
        offset: 1,
      },
    ]);
  });

  it("sends an empty body for a placeholder search", async () => {
    server.use(meilisearchHandlers.search(hits));
    expect(await bodiesOf(["--index", "movies"])).toEqual([{}]);
  });

  it("takes the body from --data, which a flag of the same field overrides", async () => {
    server.use(meilisearchHandlers.search(hits));
    expect(
      await bodiesOf(["--index", "movies", "--data", '{"q":"nosferatu","filter":[["a = 1"]]}']),
    ).toEqual([{ q: "nosferatu", filter: [["a = 1"]] }]);
    expect(
      await bodiesOf(["--index", "movies", "--data", '{"q":"nosferatu"}', "--q", "alien"]),
    ).toEqual([{ q: "alien" }]);
  });

  it("sends a value that does not convert as the text it was given, for the API to refuse", async () => {
    server.use(meilisearchHandlers.search(hits));
    expect(
      await bodiesOf([
        "--index",
        "movies",
        "--vector",
        "0.1,nope",
        "--ranking-score-threshold",
        "abc",
        "--hybrid",
        "{nope}",
      ]),
    ).toEqual([{ vector: [0.1, "nope"], rankingScoreThreshold: "abc", hybrid: "{nope}" }]);
  });

  it("refuses --output ndjson: the response is hits, not a list envelope", async () => {
    server.use(meilisearchHandlers.search(hits));
    const result = await runCommand(Search, ["--index", "movies", "--output", "ndjson"], { env });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });

  it("passes the API error of a missing index through and exits 4", async () => {
    server.use(
      meilisearchHandlers.apiError("/indexes/missing/search", 404, {
        message: "Index `missing` not found.",
        code: "index_not_found",
        type: "invalid_request",
        link: "https://docs.meilisearch.com/errors#index_not_found",
      }),
    );
    const result = await runCommand(Search, ["--index", "missing", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
