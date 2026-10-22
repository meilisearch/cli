import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const suffix = randomUUID().slice(0, 8);
const uid = `meili-cli-test-${suffix}`;
const existing = `meili-cli-test-${suffix}-existing`;

describe.skipIf(!meilisearchUp)("meili create indexes against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(existing).waitTask();
  });

  afterAll(async () => {
    await Promise.all([uid, existing].map((name) => client.deleteIndex(name).waitTask()));
  });

  it("enqueues the creation and prints the task the API returned", async () => {
    const result = await runBinary(
      ["create", "indexes", "--id", uid, "--primary-key", "id", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const task = JSON.parse(result.stdout) as { taskUid: number; type: string; status: string };
    expect(task).toMatchObject({ type: "indexCreation", status: "enqueued" });
    await client.tasks.waitForTask(task.taskUid);
    expect(await client.getRawIndex(uid)).toMatchObject({ uid, primaryKey: "id" });
  });

  it("exits 7 with the failed task when --wait sees the index already exist", async () => {
    const result = await runBinary(
      ["create", "indexes", "--id", existing, "--wait", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(7);
    const task = JSON.parse(result.stdout) as { status: string; error: { code: string } };
    expect(task.status).toBe("failed");
    expect(task.error.code).toBe("index_already_exists");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_task_failed");
  });
});
