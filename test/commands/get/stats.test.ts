import { describe, expect, it } from "vitest";
import GetStats from "../../../src/commands/get/stats.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const indexStats = {
  numberOfDocuments: 10,
  rawDocumentDbSize: 100,
  avgDocumentSize: 10,
  isIndexing: false,
  numberOfEmbeddings: 0,
  numberOfEmbeddedDocuments: 0,
  fieldDistribution: { genre: 10, title: 10 },
};
const stats = {
  databaseSize: 567,
  usedDatabaseSize: 456,
  lastUpdate: "2026-09-24T10:00:00.000000Z",
  indexes: { movies: indexStats },
};

describe("meili get stats", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "stats", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the statistics of the instance as the API returned them", async () => {
    server.use(meilisearchHandlers.stats(stats));
    const result = await runCommand(GetStats, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("prints the statistics of one index with --index", async () => {
    server.use(meilisearchHandlers.indexStats(indexStats));
    const result = await runCommand(GetStats, ["--index", "movies", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("sends the two query parameters of the route, and nothing when they are not given", async () => {
    server.use(meilisearchHandlers.stats(stats), meilisearchHandlers.indexStats(indexStats));
    const requests = await recordRequests(async () => {
      await runCommand(GetStats, [], { env });
      await runCommand(
        GetStats,
        ["--index", "movies", "--size-format", "human", "--show-internal-database-sizes"],
        { env },
      );
    });
    expect(requests.map((request) => `${request.url.pathname}${request.url.search}`)).toEqual([
      "/stats",
      "/indexes/movies/stats?showInternalDatabaseSizes=true&sizeFormat=human",
    ]);
  });

  it("passes the API error of a missing index through and exits 4", async () => {
    server.use(
      meilisearchHandlers.apiError("/indexes/missing/stats", 404, {
        message: "Index `missing` not found.",
        code: "index_not_found",
        type: "invalid_request",
        link: "https://docs.meilisearch.com/errors#index_not_found",
      }),
    );
    const result = await runCommand(GetStats, ["--index", "missing", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
