import { randomUUID } from "node:crypto";
import { Meilisearch, type SearchResponse } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-search-${randomUUID().slice(0, 8)}`;
const documents = [
  { id: 1, title: "Nosferatu", genre: "horror", rating: 4.5 },
  { id: 2, title: "Nosferatu the Vampyre", genre: "horror", rating: 4 },
  { id: 3, title: "Solaris", genre: "scifi", rating: 4.8 },
];

describe.skipIf(!meilisearchUp)("meili search against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    await client
      .index(uid)
      .updateSettings({
        filterableAttributes: ["genre", "rating"],
        sortableAttributes: ["rating"],
      })
      .waitTask();
    await client.index(uid).addDocuments(documents).waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns the hits of --q with the API envelope", async () => {
    const result = await runBinary(
      ["search", "--index", uid, "--q", "nosferatu", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const body = JSON.parse(result.stdout) as SearchResponse;
    expect(body.query).toBe("nosferatu");
    expect(body.hits.map((hit) => hit.id)).toEqual([1, 2]);
    expect(body.estimatedTotalHits).toBe(2);
  });

  it("returns every document for a placeholder search", async () => {
    const result = await runBinary(["search", "--index", uid, "--output", "json"], env);
    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.stdout) as SearchResponse).hits).toHaveLength(3);
  });

  it("filters, sorts, projects and facets", async () => {
    const result = await runBinary(
      [
        "search",
        "--index",
        uid,
        "--filter",
        "rating > 4",
        "--sort",
        "rating:desc",
        "--attributes-to-retrieve",
        "id",
        "--facets",
        "genre",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as SearchResponse;
    expect(body.hits).toEqual([{ id: 3 }, { id: 1 }]);
    expect(body.facetDistribution).toEqual({ genre: { horror: 1, scifi: 1 } });
  });

  it("switches the envelope to totalHits and totalPages with --page", async () => {
    const result = await runBinary(
      ["search", "--index", uid, "--page", "2", "--hits-per-page", "2", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as SearchResponse;
    expect(body.hits).toHaveLength(1);
    expect(body.totalHits).toBe(3);
    expect(body.totalPages).toBe(2);
  });

  it("sends the body of --data, which a flag of the same field overrides", async () => {
    const result = await runBinary(
      [
        "search",
        "--index",
        uid,
        "--data",
        '{"q":"solaris","limit":1}',
        "--q",
        "nosferatu",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as SearchResponse;
    expect(body.query).toBe("nosferatu");
    expect(body.hits).toHaveLength(1);
  });

  it("lets the API refuse a flag value that does not convert, with its own code", async () => {
    const result = await runBinary(
      ["search", "--index", uid, "--ranking-score-threshold", "abc", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("invalid_search_ranking_score_threshold");
  });

  it("exits 4 with the API error when the index does not exist", async () => {
    const result = await runBinary(
      ["search", "--index", `${uid}-missing`, "--q", "nosferatu", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });
});
