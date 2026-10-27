import { randomUUID } from "node:crypto";
import { Meilisearch, type MultiSearchResponse, type SearchResponse } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const suffix = randomUUID().slice(0, 8);
const movies = `meili-cli-test-multi-search-movies-${suffix}`;
const books = `meili-cli-test-multi-search-books-${suffix}`;

describe.skipIf(!meilisearchUp)("meili multi-search against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await Promise.all([
      client
        .index(movies)
        .addDocuments(
          [
            { id: 1, title: "Nosferatu" },
            { id: 2, title: "Solaris" },
          ],
          { primaryKey: "id" },
        )
        .waitTask(),
      client
        .index(books)
        .addDocuments([{ id: 1, title: "Nosferatu, the novel" }], { primaryKey: "id" })
        .waitTask(),
    ]);
  });

  afterAll(async () => {
    await Promise.all([movies, books].map((uid) => client.deleteIndex(uid).waitTask()));
  });

  it("answers one envelope per query, in the order of --queries", async () => {
    const result = await runBinary(
      [
        "multi-search",
        "--queries",
        JSON.stringify([
          { indexUid: movies, q: "nosferatu" },
          { indexUid: books, q: "nosferatu" },
        ]),
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const body = JSON.parse(result.stdout) as MultiSearchResponse;
    expect(body.results.map((one) => one.indexUid)).toEqual([movies, books]);
    expect(body.results.map((one) => one.hits.length)).toEqual([1, 1]);
  });

  it("merges the hits of every query with --federation", async () => {
    const result = await runBinary(
      [
        "multi-search",
        "--queries",
        JSON.stringify([
          { indexUid: movies, q: "nosferatu" },
          { indexUid: books, q: "nosferatu" },
        ]),
        "--federation",
        "{}",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as SearchResponse;
    expect(body.hits).toHaveLength(2);
    expect(body.hits.map((hit) => hit._federation?.indexUid)).toEqual([movies, books]);
  });

  it("sends the body of --data, which --queries overrides", async () => {
    const result = await runBinary(
      [
        "multi-search",
        "--data",
        JSON.stringify({ queries: [{ indexUid: books, q: "nosferatu" }] }),
        "--queries",
        JSON.stringify([{ indexUid: movies, q: "solaris" }]),
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as MultiSearchResponse;
    expect(body.results).toHaveLength(1);
    expect(body.results[0]?.indexUid).toBe(movies);
  });

  it("lets the API name the missing queries when neither --queries nor a body is given", async () => {
    const result = await runBinary(["multi-search", "--output", "json"], env);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.message).toBe("Missing field `queries`");
  });

  it("passes the error of an index that does not exist through, which the route answers 400", async () => {
    const result = await runBinary(
      [
        "multi-search",
        "--queries",
        JSON.stringify([{ indexUid: `${movies}-missing`, q: "nosferatu" }]),
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });
});
