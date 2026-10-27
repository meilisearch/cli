import { describe, expect, it } from "vitest";
import MultiSearch from "../../src/commands/multi-search.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../helpers/msw.js";
import { runCli, runCommand } from "../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const queries = '[{"indexUid":"movies","q":"nosferatu"},{"indexUid":"books","q":"nosferatu"}]';

/** The envelope the route answers without a `federation`: one result per query. */
const perQuery = {
  results: [
    {
      indexUid: "movies",
      hits: [{ id: 1, title: "Nosferatu" }],
      query: "nosferatu",
      processingTimeMs: 1,
      limit: 20,
      offset: 0,
      estimatedTotalHits: 1,
    },
    {
      indexUid: "books",
      hits: [{ id: "dracula", title: "Dracula" }],
      query: "nosferatu",
      processingTimeMs: 1,
      limit: 20,
      offset: 0,
      estimatedTotalHits: 1,
    },
  ],
};

/** The body the CLI sent to POST /multi-search, request by request. */
async function bodiesOf(argv: string[]): Promise<unknown[]> {
  const requests = await recordRequests(async () => {
    await runCommand(MultiSearch, argv, { env });
  });
  return requests.map((request) => JSON.parse(request.body));
}

describe("meili multi-search", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["multi-search", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is in JSON", async () => {
    server.use(meilisearchHandlers.multiSearch(perQuery));
    const result = await runCommand(MultiSearch, ["--queries", queries, "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });

  it("sends the two body fields as the JSON they spell, `null` included", async () => {
    server.use(meilisearchHandlers.multiSearch(perQuery));
    const sent = [
      { indexUid: "movies", q: "nosferatu" },
      { indexUid: "books", q: "nosferatu" },
    ];
    expect(await bodiesOf(["--queries", queries, "--federation", '{"limit":5}'])).toEqual([
      { queries: sent, federation: { limit: 5 } },
    ]);
    expect(await bodiesOf(["--queries", queries, "--federation", "null"])).toEqual([
      { queries: sent, federation: null },
    ]);
  });

  it("takes the body from --data, which a flag of the same field overrides", async () => {
    server.use(meilisearchHandlers.multiSearch(perQuery));
    expect(
      await bodiesOf(["--data", '{"queries":[{"indexUid":"movies"}],"federation":{}}']),
    ).toEqual([{ queries: [{ indexUid: "movies" }], federation: {} }]);
    expect(
      await bodiesOf([
        "--data",
        '{"queries":[{"indexUid":"movies"}],"federation":{}}',
        "--queries",
        '[{"indexUid":"books"}]',
      ]),
    ).toEqual([{ queries: [{ indexUid: "books" }], federation: {} }]);
  });

  it("sends a value that does not convert as the text it was given, for the API to refuse", async () => {
    server.use(meilisearchHandlers.multiSearch(perQuery));
    expect(await bodiesOf(["--queries", "movies"])).toEqual([{ queries: "movies" }]);
  });

  it("refuses --output ndjson: the response is hits, not a list envelope", async () => {
    server.use(meilisearchHandlers.multiSearch(perQuery));
    const result = await runCommand(MultiSearch, ["--queries", queries, "--output", "ndjson"], {
      env,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });

  it("passes the API error of a missing index through, which the route answers 400", async () => {
    server.use(
      meilisearchHandlers.apiError("/multi-search", 400, {
        message: "Inside `.queries[0]`: Index `missing` not found.",
        code: "index_not_found",
        type: "invalid_request",
        link: "https://docs.meilisearch.com/errors#index_not_found",
      }),
    );
    const result = await runCommand(
      MultiSearch,
      ["--queries", '[{"indexUid":"missing","q":"nosferatu"}]', "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
