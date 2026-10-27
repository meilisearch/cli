import { describe, expect, it } from "vitest";
import FacetSearch from "../../src/commands/facet-search.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../helpers/msw.js";
import { runCli, runCommand } from "../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const facetHits = [
  { value: "action", count: 273 },
  { value: "animated", count: 15 },
];

/** The body the CLI sent to POST /indexes/{uid}/facet-search, request by request. */
async function bodiesOf(argv: string[]): Promise<unknown[]> {
  const requests = await recordRequests(async () => {
    await runCommand(FacetSearch, argv, { env });
  });
  return requests.map((request) => JSON.parse(request.body));
}

describe("meili facet-search", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["facet-search", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is in JSON", async () => {
    server.use(meilisearchHandlers.facetSearch(facetHits));
    const result = await runCommand(
      FacetSearch,
      ["--index", "movies", "--facet-name", "genres", "--facet-query", "ac", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("sends the parameters of the route in its body", async () => {
    server.use(meilisearchHandlers.facetSearch(facetHits));
    const bodies = await bodiesOf([
      "--index",
      "movies",
      "--facet-name",
      "genres",
      "--facet-query",
      "ac",
      "--q",
      "horror",
      "--filter",
      "rating > 4",
      "--matching-strategy",
      "all",
      "--attributes-to-search-on",
      "title,overview",
      "--ranking-score-threshold",
      "0.7",
      "--locales",
      "eng,fra",
      "--hybrid",
      '{"embedder":"default","semanticRatio":0.5}',
      "--vector",
      "0.1,0.2",
      "--exhaustive-facet-count",
    ]);
    expect(bodies).toEqual([
      {
        facetName: "genres",
        facetQuery: "ac",
        q: "horror",
        filter: "rating > 4",
        matchingStrategy: "all",
        attributesToSearchOn: ["title", "overview"],
        rankingScoreThreshold: 0.7,
        locales: ["eng", "fra"],
        hybrid: { embedder: "default", semanticRatio: 0.5 },
        vector: [0.1, 0.2],
        exhaustiveFacetCount: true,
      },
    ]);
  });

  it("takes the body from --data, which a flag of the same field overrides", async () => {
    server.use(meilisearchHandlers.facetSearch(facetHits));
    expect(
      await bodiesOf([
        "--index",
        "movies",
        "--data",
        '{"facetName":"genres","filter":[["a = 1"]]}',
      ]),
    ).toEqual([{ facetName: "genres", filter: [["a = 1"]] }]);
    expect(
      await bodiesOf([
        "--index",
        "movies",
        "--data",
        '{"facetName":"genres"}',
        "--facet-name",
        "authors",
      ]),
    ).toEqual([{ facetName: "authors" }]);
  });

  it("refuses --output ndjson: the response is facet hits, not a list envelope", async () => {
    server.use(meilisearchHandlers.facetSearch(facetHits));
    const result = await runCommand(
      FacetSearch,
      ["--index", "movies", "--facet-name", "genres", "--output", "ndjson"],
      { env },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });

  it("passes the API error of an attribute that is not filterable through and exits 1", async () => {
    server.use(
      meilisearchHandlers.apiError("/indexes/movies/facet-search", 400, {
        message:
          "Attribute `title` is not facet-searchable. Available facet-searchable attributes patterns are: `genres`.",
        code: "invalid_facet_search_facet_name",
        type: "invalid_request",
        link: "https://docs.meilisearch.com/errors#invalid_facet_search_facet_name",
      }),
    );
    const result = await runCommand(
      FacetSearch,
      ["--index", "movies", "--facet-name", "title", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
