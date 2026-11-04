import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = `meili-cli-test-document-update-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili document update against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    await client
      .index(uid)
      .addDocuments([{ id: 1, title: "Alien", rating: 5 }])
      .waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("merges the given fields into the document instead of replacing it", async () => {
    const result = await runBinary([
      "document",
      "update",
      "--index",
      uid,
      "--data",
      '[{"id":1,"rating":4}]',
      "--wait",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "succeeded" });
    expect(await client.index(uid).getDocument(1)).toEqual({ id: 1, title: "Alien", rating: 4 });
  });

  it("enqueues a task and returns at once, without --wait", async () => {
    const result = await runBinary([
      "document",
      "update",
      "--index",
      uid,
      "--data",
      '[{"id":2,"title":"Solaris"}]',
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const task = JSON.parse(result.stdout) as { taskUid: number; status: string };
    expect(task.status).toBe("enqueued");
    await client.tasks.waitForTask(task.taskUid);
    expect(await client.index(uid).getDocument(2)).toMatchObject({ title: "Solaris" });
  });

  it("exits 2 without documents, and sends nothing", async () => {
    const result = await runBinary(["document", "update", "--index", uid, ...project]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });
});
