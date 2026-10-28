import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-get-batches-${randomUUID().slice(0, 8)}`;
let taskUid = 0;
let batchUid = 0;

describe.skipIf(!meilisearchUp)("meili get batches against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    const task = await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    taskUid = task.uid;
    batchUid = task.batchUid ?? 0;
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns the list envelope filtered by --index-ids", async () => {
    const result = await runBinary(
      ["get", "batches", "--index-ids", uid, "--all", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const page = JSON.parse(result.stdout) as { results: Array<{ uid: number }> };
    expect(page.results.map((batch) => batch.uid)).toContain(batchUid);
  });

  it("filters by --ids, the batch uids of the route", async () => {
    const result = await runBinary(
      ["get", "batches", "--ids", String(batchUid), "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    const page = JSON.parse(result.stdout) as {
      results: Array<{ uid: number; stats: { indexUids: Record<string, number> } }>;
      total: number;
    };
    expect(page.total).toBe(1);
    expect(page.results[0]?.uid).toBe(batchUid);
    expect(page.results[0]?.stats.indexUids).toHaveProperty(uid);
  });

  it("filters by --task-ids, the task uids the batch processed", async () => {
    const result = await runBinary(
      ["get", "batches", "--task-ids", String(taskUid), "--output", "ndjson"],
      env,
    );
    expect(result.exitCode).toBe(0);
    const uids = result.stdout
      .trimEnd()
      .split("\n")
      .map((line) => (JSON.parse(line) as { uid: number }).uid);
    expect(uids).toContain(batchUid);
  });

  it("exits 1 with the API error when a filter value is not one the API knows", async () => {
    const result = await runBinary(
      ["get", "batches", "--statuses", "nope", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("invalid_task_statuses");
  });
});
