import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-create-documents-${randomUUID().slice(0, 8)}`;
const file = join(mkdtempSync(join(tmpdir(), "meili-cli-test-")), "movies.json");
writeFileSync(file, JSON.stringify([{ id: 1, title: "Nosferatu" }]));

describe.skipIf(!meilisearchUp)("meili create documents against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("enqueues a task and returns at once, without --wait", async () => {
    const result = await runBinary(
      ["create", "documents", "--index", uid, "--file", file, "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const task = JSON.parse(result.stdout) as { taskUid: number; status: string; type: string };
    expect(task).toMatchObject({ status: "enqueued", type: "documentAdditionOrUpdate" });
    await client.tasks.waitForTask(task.taskUid);
  });

  it("reads the documents from stdin with --file -, and --wait prints the final task", async () => {
    const result = await runBinary(
      ["create", "documents", "--index", uid, "--file", "-", "--wait", "--output", "json"],
      env,
      JSON.stringify([{ id: 2, title: "Alien" }]),
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "succeeded" });
    expect(await client.index(uid).getDocument(2)).toMatchObject({ title: "Alien" });
  });

  it("replaces a document that has the same primary key", async () => {
    const result = await runBinary(
      [
        "create",
        "documents",
        "--index",
        uid,
        "--data",
        '[{"id":1,"rating":5}]',
        "--wait",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(await client.index(uid).getDocument(1)).toEqual({ id: 1, rating: 5 });
  });

  it("prints the failed task and exits 7 when --wait sees the task fail", async () => {
    const result = await runBinary(
      [
        "create",
        "documents",
        "--index",
        uid,
        "--data",
        '[{"title":"no primary key here"}]',
        "--wait",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(7);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "failed",
      error: { code: "missing_document_id" },
    });
    expect(JSON.parse(result.stderr).error.code).toBe("cli_task_failed");
  });
});
