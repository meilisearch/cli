import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { writeTempJson } from "../../helpers/temp-json.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-${randomUUID().slice(0, 8)}`;
const movies = [
  { id: 1, title: "Nosferatu" },
  { id: 2, title: "Metropolis" },
];

describe.skipIf(!meilisearchUp)("meili create documents against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("indexes the documents of a file and waits for the task with --wait", async () => {
    const path = writeTempJson(movies);

    const result = await runBinary(
      ["create", "documents", "--index", uid, "--file", path, "--wait", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    const task = JSON.parse(result.stdout) as { status: string; type: string };
    expect(task).toMatchObject({ status: "succeeded", type: "documentAdditionOrUpdate" });
    expect(await client.index(uid).getDocument(1)).toMatchObject({ title: "Nosferatu" });
  });

  it("reads the documents from stdin with --file -", async () => {
    const result = await runBinary(
      ["create", "documents", "--index", uid, "--file", "-", "--wait", "--output", "json"],
      env,
      JSON.stringify([{ id: 3, title: "Caligari" }]),
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe("succeeded");
    expect(await client.index(uid).getDocument(3)).toMatchObject({ title: "Caligari" });
  });
});
