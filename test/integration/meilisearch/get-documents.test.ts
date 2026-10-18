import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-${randomUUID().slice(0, 8)}`;
const movies = [1, 2, 3, 4, 5].map((id) => ({ id, title: `Movie ${id}`, year: 1920 + id }));

describe.skipIf(!meilisearchUp)("meili get documents against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    await client.index(uid).updateFilterableAttributes(["year"]).waitTask();
    await client.index(uid).addDocuments(movies).waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns the documents in the API envelope", async () => {
    const result = await runBinary(
      ["get", "documents", "--index", uid, "--limit", "2", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const page = JSON.parse(result.stdout) as {
      results: Array<{ id: number }>;
      offset: number;
      limit: number;
      total: number;
    };
    expect(page).toMatchObject({ offset: 0, limit: 2, total: 5 });
    expect(page.results).toHaveLength(2);
  });

  it("selects by identifier and trims the fields", async () => {
    const result = await runBinary(
      ["get", "documents", "--index", uid, "--ids", "2,4", "--fields", "id", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    const page = JSON.parse(result.stdout) as { results: Array<Record<string, unknown>> };
    expect(page.results).toEqual([{ id: 2 }, { id: 4 }]);
  });

  it("filters and streams every page with --all in ndjson", async () => {
    const result = await runBinary(
      [
        "get",
        "documents",
        "--index",
        uid,
        "--filter",
        "year > 1922",
        "--all",
        "--limit",
        "1",
        "--output",
        "ndjson",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const ids = result.stdout
      .trimEnd()
      .split("\n")
      .map((line) => (JSON.parse(line) as { id: number }).id);
    expect(ids).toEqual([3, 4, 5]);
  });

  it("exits 4 with the API error when the index does not exist", async () => {
    const result = await runBinary(["get", "documents", "--index", `${uid}-missing`], env);
    expect(result.exitCode).toBe(4);
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });
});
