import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = `meili-cli-test-index-add-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili index add against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("creates the index with its primary key", async () => {
    const result = await runBinary([
      "index",
      "add",
      "--id",
      uid,
      "--primary-key",
      "id",
      "--wait",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      indexUid: uid,
      type: "indexCreation",
      status: "succeeded",
    });
    expect(await client.index(uid).getRawInfo()).toMatchObject({ uid, primaryKey: "id" });
  });
});
