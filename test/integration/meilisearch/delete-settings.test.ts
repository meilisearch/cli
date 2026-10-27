import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-delete-settings-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili delete settings against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid).waitTask();
    await client
      .index(uid)
      .updateSettings({ stopWords: ["the"], searchableAttributes: ["title"] })
      .waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("resets every setting to its default value", async () => {
    const result = await runBinary(
      ["delete", "settings", "--index", uid, "--yes", "--wait", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      indexUid: uid,
      type: "settingsUpdate",
      status: "succeeded",
    });
    expect(await client.index(uid).getSettings()).toMatchObject({
      stopWords: [],
      searchableAttributes: ["*"],
    });
  });

  it("refuses to run without --yes and leaves the settings alone", async () => {
    await client
      .index(uid)
      .updateSettings({ stopWords: ["the"] })
      .waitTask();
    const result = await runBinary(["delete", "settings", "--index", uid, "--output", "json"], env);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
    expect(await client.index(uid).getSettings()).toMatchObject({ stopWords: ["the"] });
  });
});
