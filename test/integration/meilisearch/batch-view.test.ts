import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = `meili-cli-test-batch-view-${randomUUID().slice(0, 8)}`;
let batch = 0;

describe.skipIf(!meilisearchUp)("meili batch view against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    const task = await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    batch = task.batchUid ?? 0;
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("prints the batch itself, not a list", async () => {
    const result = await runBinary(["batch", "view", "--id", String(batch), ...project]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({ uid: batch });
  });

  it("exits 4 with the API error when the batch does not exist", async () => {
    const result = await runBinary(["batch", "view", "--id", "4294967295", ...project]);
    expect(result.exitCode).toBe(4);
    expect(JSON.parse(result.stderr).error.code).toBe("batch_not_found");
  });
});
