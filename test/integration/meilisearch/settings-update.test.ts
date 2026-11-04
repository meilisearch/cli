import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = `meili-cli-test-settings-update-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili settings update against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid).waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("sets the settings given and leaves the others as they are", async () => {
    const result = await runBinary([
      "settings",
      "update",
      "--index",
      uid,
      "--stop-words",
      "the,a",
      "--typo-tolerance",
      '{"enabled":false}',
      "--wait",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      indexUid: uid,
      type: "settingsUpdate",
      status: "succeeded",
    });
    expect(await client.index(uid).getSettings()).toMatchObject({
      stopWords: ["a", "the"],
      typoTolerance: { enabled: false },
      searchableAttributes: ["*"],
    });
  });

  it("resets one setting with the value null", async () => {
    const result = await runBinary([
      "settings",
      "update",
      "--index",
      uid,
      "--stop-words",
      "null",
      "--wait",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    const settings = await client.index(uid).getSettings();
    expect(settings.stopWords).toEqual([]);
    expect(settings.typoTolerance).toMatchObject({ enabled: false });
  });

  it("exits 1 with the API error when it refuses a value, before any task", async () => {
    const result = await runBinary([
      "settings",
      "update",
      "--index",
      uid,
      "--proximity-precision",
      "byNothing",
      "--wait",
      ...project,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("invalid_settings_proximity_precision");
  });
});
