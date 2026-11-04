import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = `meili-cli-test-task-delete-${randomUUID().slice(0, 8)}`;
let created = 0;

// The index is created and dropped in beforeAll, so the only task left to the
// suite is its own: the filters never name anything another suite owns.
describe.skipIf(!meilisearchUp)("meili task delete against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    const task = await client.createIndex(uid).waitTask();
    created = task.uid;
    await client.deleteIndex(uid).waitTask();
  });

  it("exits 2 and deletes nothing without --yes", async () => {
    const result = await runBinary([
      "task",
      "delete",
      "--ids",
      String(created),
      "--output",
      "json",
      ...project,
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
    await expect(client.tasks.getTask(created)).resolves.toMatchObject({ uid: created });
  });

  it("exits 2 without a filter, before any network call", async () => {
    const result = await runBinary(["task", "delete", "--yes", "--output", "json", ...project]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });

  it("deletes the task named by --ids", async () => {
    const result = await runBinary([
      "task",
      "delete",
      "--ids",
      String(created),
      "--yes",
      "--wait",
      "--output",
      "json",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      type: "taskDeletion",
      status: "succeeded",
    });
    await expect(client.tasks.getTask(created)).rejects.toThrow();
  });
});
