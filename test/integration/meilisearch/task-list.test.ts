import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = `meili-cli-test-task-list-${randomUUID().slice(0, 8)}`;
let created = 0;

describe.skipIf(!meilisearchUp)("meili task list against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    const task = await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    created = task.uid;
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns the list envelope filtered by --index-ids", async () => {
    const result = await runBinary(["task", "list", "--index-ids", uid, "--all", ...project]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const page = JSON.parse(result.stdout) as { results: Array<{ uid: number; type: string }> };
    expect(page.results.map((task) => task.type)).toContain("indexCreation");
    expect(page.results.map((task) => task.uid)).toContain(created);
  });

  it("narrows the list with --ids", async () => {
    const result = await runBinary(["task", "list", "--ids", String(created), ...project]);
    expect(result.exitCode).toBe(0);
    const page = JSON.parse(result.stdout) as {
      results: Array<{ uid: number; indexUid: string; status: string }>;
      total: number;
    };
    expect(page.total).toBe(1);
    expect(page.results[0]).toMatchObject({ uid: created, indexUid: uid, status: "succeeded" });
  });

  it("exits 1 with the API error when a filter value is not one the API knows", async () => {
    const result = await runBinary(["task", "list", "--statuses", "nope", ...project]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("invalid_task_statuses");
  });
});
