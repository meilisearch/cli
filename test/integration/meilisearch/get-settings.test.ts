import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-get-settings-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili get settings against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid).waitTask();
    await client
      .index(uid)
      .updateSettings({ stopWords: ["the"] })
      .waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns every setting, the ones set and the defaults", async () => {
    const result = await runBinary(["get", "settings", "--index", uid, "--output", "json"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      stopWords: ["the"],
      searchableAttributes: ["*"],
      rankingRules: expect.arrayContaining(["words", "typo"]),
    });
  });

  it("exits 4 with the API error when the index does not exist", async () => {
    const result = await runBinary(
      ["get", "settings", "--index", `${uid}-missing`, "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });
});
