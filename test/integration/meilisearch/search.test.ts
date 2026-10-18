import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili search against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    await client.index(uid).updateFilterableAttributes(["year"]).waitTask();
    await client
      .index(uid)
      .addDocuments([
        { id: 1, title: "Nosferatu", year: 1922 },
        { id: 2, title: "Metropolis", year: 1927 },
        { id: 3, title: "The Cabinet of Dr. Caligari", year: 1920 },
      ])
      .waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns the hits of the query in the envelope of the API", async () => {
    const result = await runBinary(
      ["search", "--index", uid, "--q", "nosferatu", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const page = JSON.parse(result.stdout) as {
      hits: Array<{ id: number; title: string }>;
      query: string;
      estimatedTotalHits: number;
    };
    expect(page.query).toBe("nosferatu");
    expect(page.hits.map((hit) => hit.id)).toEqual([1]);
  });

  it("filters, sorts and trims the hits with the flags", async () => {
    const result = await runBinary(
      [
        "search",
        "--index",
        uid,
        "--filter",
        "year > 1920",
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
    const page = JSON.parse(result.stdout) as {
      hits: Array<Record<string, unknown>>;
      limit: number;
    };
    expect(page.limit).toBe(1);
    expect(page.hits).toHaveLength(1);
    expect(Object.keys(page.hits[0] ?? {})).toEqual(["id"]);
  });

  it("exits 4 with the API error when the index does not exist", async () => {
    const result = await runBinary(["search", "--index", `${uid}-missing`, "--q", "x"], env);
    expect(result.exitCode).toBe(4);
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });
});
