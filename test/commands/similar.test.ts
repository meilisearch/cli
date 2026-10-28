import { describe, expect, it } from "vitest";
import Similar from "../../src/commands/similar.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../helpers/msw.js";
import { runCli, runCommand } from "../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const hits = [
  { id: 2770, title: "American Pie 2" },
  { id: 190859, title: "American Sniper" },
];

/** The body the CLI sent to POST /indexes/{uid}/similar, request by request. */
async function bodiesOf(argv: string[]): Promise<unknown[]> {
  const requests = await recordRequests(async () => {
    await runCommand(Similar, argv, { env });
  });
  return requests.map((request) => JSON.parse(request.body));
}

describe("meili similar", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["similar", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is in JSON", async () => {
    server.use(meilisearchHandlers.similar(hits));
    const result = await runCommand(
      Similar,
      ["--index", "movies", "--id", "143", "--embedder", "default", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("sends the parameters of the route in its body", async () => {
    server.use(meilisearchHandlers.similar(hits));
    const bodies = await bodiesOf([
      "--index",
      "movies",
      "--id",
      "143",
      "--embedder",
      "default",
      "--filter",
      "genres = horror",
      "--attributes-to-retrieve",
      "id,title",
      "--ranking-score-threshold",
      "0.7",
      "--retrieve-vectors",
      "--show-ranking-score",
      "--limit",
      "2",
      "--offset",
      "1",
    ]);
    expect(bodies).toEqual([
      {
        id: "143",
        embedder: "default",
        filter: "genres = horror",
        attributesToRetrieve: ["id", "title"],
        rankingScoreThreshold: 0.7,
        retrieveVectors: true,
        showRankingScore: true,
        limit: 2,
        offset: 1,
      },
    ]);
  });

  it("takes the body from --data, which a flag of the same field overrides", async () => {
    server.use(meilisearchHandlers.similar(hits));
    expect(
      await bodiesOf(["--index", "movies", "--data", '{"id":143,"embedder":"default"}']),
    ).toEqual([{ id: 143, embedder: "default" }]);
    expect(
      await bodiesOf([
        "--index",
        "movies",
        "--data",
        '{"id":143,"embedder":"default"}',
        "--id",
        "2770",
      ]),
    ).toEqual([{ id: "2770", embedder: "default" }]);
  });

  it("sends a value that does not convert as the text it was given, for the API to refuse", async () => {
    server.use(meilisearchHandlers.similar(hits));
    expect(
      await bodiesOf([
        "--index",
        "movies",
        "--id",
        "143",
        "--embedder",
        "default",
        "--ranking-score-threshold",
        "abc",
      ]),
    ).toEqual([{ id: "143", embedder: "default", rankingScoreThreshold: "abc" }]);
  });

  it("refuses --output ndjson: the response is hits, not a list envelope", async () => {
    server.use(meilisearchHandlers.similar(hits));
    const result = await runCommand(
      Similar,
      ["--index", "movies", "--id", "143", "--embedder", "default", "--output", "ndjson"],
      { env },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });

  it("passes the API error of a missing index through and exits 4", async () => {
    server.use(
      meilisearchHandlers.apiError("/indexes/missing/similar", 404, {
        message: "Index `missing` not found.",
        code: "index_not_found",
        type: "invalid_request",
        link: "https://docs.meilisearch.com/errors#index_not_found",
      }),
    );
    const result = await runCommand(
      Similar,
      ["--index", "missing", "--id", "143", "--embedder", "default", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
