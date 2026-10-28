import { randomUUID } from "node:crypto";
import { Meilisearch, type SearchResponse } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-similar-${randomUUID().slice(0, 8)}`;
// A user-provided embedder: the vectors come with the documents, so the suite
// needs no embedding service to have a similarity to compare.
const documents = [
  { id: 1, title: "Nosferatu", genre: "horror", _vectors: { manual: [1, 0, 0] } },
  { id: 2, title: "Dracula", genre: "horror", _vectors: { manual: [0.9, 0.1, 0] } },
  { id: 3, title: "Solaris", genre: "scifi", _vectors: { manual: [0, 0, 1] } },
];

describe.skipIf(!meilisearchUp)("meili similar against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    await client
      .index(uid)
      .updateSettings({
        filterableAttributes: ["genre"],
        embedders: { manual: { source: "userProvided", dimensions: 3 } },
      })
      .waitTask();
    await client.index(uid).addDocuments(documents).waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns the documents closest to --id, the target excluded", async () => {
    const result = await runBinary(
      ["similar", "--index", uid, "--id", "1", "--embedder", "manual", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const body = JSON.parse(result.stdout) as SearchResponse & { id: string };
    expect(body.id).toBe("1");
    expect(body.hits.map((hit) => hit.id)).toEqual([2, 3]);
  });

  it("filters and limits the similar documents", async () => {
    const result = await runBinary(
      [
        "similar",
        "--index",
        uid,
        "--id",
        "1",
        "--embedder",
        "manual",
        "--filter",
        "genre = horror",
        "--attributes-to-retrieve",
        "id",
        "--limit",
        "1",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as SearchResponse;
    expect(body.hits).toEqual([{ id: 2 }]);
  });

  it("sends the body of --data, which a flag of the same field overrides", async () => {
    const result = await runBinary(
      [
        "similar",
        "--index",
        uid,
        "--data",
        JSON.stringify({ id: 1, embedder: "manual", limit: 1 }),
        "--id",
        "3",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as SearchResponse & { id: string };
    expect(body.id).toBe("3");
    expect(body.hits).toHaveLength(1);
  });

  it("lets the API refuse a document that does not exist, with its own code", async () => {
    const result = await runBinary(
      ["similar", "--index", uid, "--id", "404", "--embedder", "manual", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("not_found_similar_id");
  });

  it("exits 4 with the API error when the index does not exist", async () => {
    const result = await runBinary(
      [
        "similar",
        "--index",
        `${uid}-missing`,
        "--id",
        "1",
        "--embedder",
        "manual",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });
});
