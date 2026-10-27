import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-get-tasks-${randomUUID().slice(0, 8)}`;
let created = 0;

describe.skipIf(!meilisearchUp)("meili get tasks against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    const task = await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    created = task.uid;
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns the list envelope filtered by --index-ids", async () => {
    const result = await runBinary(
      ["get", "tasks", "--index-ids", uid, "--all", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const page = JSON.parse(result.stdout) as { results: Array<{ uid: number; type: string }> };
    expect(page.results.map((task) => task.type)).toContain("indexCreation");
    expect(page.results.map((task) => task.uid)).toContain(created);
  });

  it("filters by --ids and still answers the list envelope", async () => {
    const result = await runBinary(
      ["get", "tasks", "--ids", String(created), "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    const page = JSON.parse(result.stdout) as {
      results: Array<{ uid: number; indexUid: string; status: string }>;
      total: number;
    };
    expect(page.total).toBe(1);
    expect(page.results[0]).toMatchObject({ uid: created, indexUid: uid, status: "succeeded" });
  });

  it("streams the tasks of the index as ndjson", async () => {
    const result = await runBinary(
      ["get", "tasks", "--index-ids", uid, "--all", "--limit", "1", "--output", "ndjson"],
      env,
    );
    expect(result.exitCode).toBe(0);
    const uids = result.stdout
      .trimEnd()
      .split("\n")
      .map((line) => (JSON.parse(line) as { uid: number }).uid);
    expect(uids).toContain(created);
  });

  it("exits 1 with the API error when a filter value is not one the API knows", async () => {
    const result = await runBinary(["get", "tasks", "--statuses", "nope", "--output", "json"], env);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("invalid_task_statuses");
  });
});
