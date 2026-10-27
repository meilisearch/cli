import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-cancel-tasks-${randomUUID().slice(0, 8)}`;
let created = 0;

// Every filter names this suite's own task uid: the suites run in parallel, and
// a cancelation by status would reach the tasks of the others.
describe.skipIf(!meilisearchUp)("meili cancel tasks against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    const task = await client.createIndex(uid).waitTask();
    created = task.uid;
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("enqueues a taskCancelation and waits for it", async () => {
    const result = await runBinary(
      ["cancel", "tasks", "--ids", String(created), "--wait", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    // The task has already succeeded, so the cancelation matches nothing: what
    // the command owns is the taskCancelation it enqueued and polled.
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: "taskCancelation",
      status: "succeeded",
    });
  });

  it("prints the enqueued task and returns at once without --wait", async () => {
    const result = await runBinary(
      ["cancel", "tasks", "--ids", String(created), "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: "taskCancelation",
      status: "enqueued",
    });
  });

  it("exits 1 with the API error when no filter is given", async () => {
    const result = await runBinary(["cancel", "tasks", "--output", "json"], env);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("missing_task_filters");
  });
});
