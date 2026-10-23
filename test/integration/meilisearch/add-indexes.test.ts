import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-add-indexes-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili add indexes against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("creates the index with its primary key", async () => {
    const result = await runBinary(
      ["add", "indexes", "--id", uid, "--primary-key", "id", "--wait", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      indexUid: uid,
      type: "indexCreation",
      status: "succeeded",
    });
    expect(await client.index(uid).getRawInfo()).toMatchObject({ uid, primaryKey: "id" });
  });
});
