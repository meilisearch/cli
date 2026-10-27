import { randomUUID } from "node:crypto";
import { Meilisearch, type SearchForFacetValuesResponse } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-facet-search-${randomUUID().slice(0, 8)}`;
const documents = [
  { id: 1, title: "Nosferatu", genre: "horror", rating: 4.5 },
  { id: 2, title: "Dracula", genre: "horror", rating: 4 },
  { id: 3, title: "Solaris", genre: "scifi", rating: 4.8 },
];

describe.skipIf(!meilisearchUp)("meili facet-search against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    await client
      .index(uid)
      .updateSettings({ filterableAttributes: ["genre", "rating"] })
      .waitTask();
    await client.index(uid).addDocuments(documents).waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns the facet values that match --facet-query, with their counts", async () => {
    const result = await runBinary(
      [
        "facet-search",
        "--index",
        uid,
        "--facet-name",
        "genre",
        "--facet-query",
        "ho",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const body = JSON.parse(result.stdout) as SearchForFacetValuesResponse;
    expect(body.facetQuery).toBe("ho");
    expect(body.facetHits).toEqual([{ value: "horror", count: 2 }]);
  });

  it("returns every value of the facet without --facet-query", async () => {
    const result = await runBinary(
      ["facet-search", "--index", uid, "--facet-name", "genre", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as SearchForFacetValuesResponse;
    expect(body.facetQuery).toBeNull();
    expect(body.facetHits).toEqual([
      { value: "horror", count: 2 },
      { value: "scifi", count: 1 },
    ]);
  });

  it("counts the values on the documents --filter keeps", async () => {
    const result = await runBinary(
      [
        "facet-search",
        "--index",
        uid,
        "--facet-name",
        "genre",
        "--filter",
        "rating > 4.2",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as SearchForFacetValuesResponse;
    expect(body.facetHits).toEqual([
      { value: "horror", count: 1 },
      { value: "scifi", count: 1 },
    ]);
  });

  it("sends the body of --data, which a flag of the same field overrides", async () => {
    const result = await runBinary(
      [
        "facet-search",
        "--index",
        uid,
        "--data",
        JSON.stringify({ facetName: "genre", facetQuery: "sc" }),
        "--facet-query",
        "ho",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as SearchForFacetValuesResponse;
    expect(body.facetHits).toEqual([{ value: "horror", count: 2 }]);
  });

  it("lets the API refuse an attribute that is not filterable, with its own code", async () => {
    const result = await runBinary(
      ["facet-search", "--index", uid, "--facet-name", "title", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("invalid_facet_search_facet_name");
  });

  it("exits 4 with the API error when the index does not exist", async () => {
    const result = await runBinary(
      ["facet-search", "--index", `${uid}-missing`, "--facet-name", "genre", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });
});
