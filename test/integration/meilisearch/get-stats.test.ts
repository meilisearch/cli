import { randomUUID } from "node:crypto";
import { type IndexStats, Meilisearch, type Stats } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-get-stats-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili get stats against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client
      .index(uid)
      .addDocuments(
        [
          { id: 1, title: "Nosferatu" },
          { id: 2, title: "Solaris" },
        ],
        { primaryKey: "id" },
      )
      .waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns the statistics of the instance, with one entry per index", async () => {
    const result = await runBinary(["get", "stats", "--output", "json"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const body = JSON.parse(result.stdout) as Stats;
    expect(typeof body.databaseSize).toBe("number");
    expect(body.indexes[uid]?.numberOfDocuments).toBe(2);
  });

  it("returns the statistics of one index with --index", async () => {
    const result = await runBinary(["get", "stats", "--index", uid, "--output", "json"], env);
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as IndexStats;
    expect(body.numberOfDocuments).toBe(2);
    expect(body.fieldDistribution).toEqual({ id: 2, title: 2 });
  });

  it("writes the sizes as strings with --size-format human, and adds --show-internal-database-sizes", async () => {
    const result = await runBinary(
      [
        "get",
        "stats",
        "--index",
        uid,
        "--size-format",
        "human",
        "--show-internal-database-sizes",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as { indexSize: string; internalDatabaseSizes: object };
    expect(typeof body.indexSize).toBe("string");
    expect(body.internalDatabaseSizes).toBeTypeOf("object");
  });

  it("exits 4 with the API error when the index does not exist", async () => {
    const result = await runBinary(
      ["get", "stats", "--index", `${uid}-missing`, "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });
});
