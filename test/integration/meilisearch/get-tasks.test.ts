import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-${randomUUID().slice(0, 8)}`;
let creationUid = 0;

describe.skipIf(!meilisearchUp)("meili get tasks against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    const task = await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    creationUid = task.uid;
    await client
      .index(uid)
      .addDocuments([{ id: 1, title: "Nosferatu" }])
      .waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("filters by index and returns the tasks of that index, most recent first", async () => {
    const result = await runBinary(["get", "tasks", "--index-ids", uid, "--output", "json"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const page = JSON.parse(result.stdout) as {
      results: Array<{ uid: number; type: string; indexUid: string }>;
      total: number;
    };
    expect(page.results.map((task) => task.type)).toEqual([
      "documentAdditionOrUpdate",
      "indexCreation",
    ]);
    expect(page.results.every((task) => task.indexUid === uid)).toBe(true);
  });

  it("gets one task with --ids, in the list envelope", async () => {
    const result = await runBinary(["get", "tasks", "--ids", String(creationUid)], env);
    expect(result.exitCode).toBe(0);
    const page = JSON.parse(result.stdout) as { results: Array<{ uid: number; status: string }> };
    expect(page.results).toHaveLength(1);
    expect(page.results[0]).toMatchObject({ uid: creationUid, status: "succeeded" });
  });

  it("streams every task of the index with --all in ndjson", async () => {
    const result = await runBinary(
      ["get", "tasks", "--index-ids", uid, "--all", "--limit", "1", "--output", "ndjson"],
      env,
    );
    expect(result.exitCode).toBe(0);
    const uids = result.stdout
      .trimEnd()
      .split("\n")
      .map((line) => (JSON.parse(line) as { uid: number }).uid);
    expect(uids).toContain(creationUid);
    expect(new Set(uids).size).toBe(uids.length);
  });
});
