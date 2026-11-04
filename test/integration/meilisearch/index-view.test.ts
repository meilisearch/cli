import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const suffix = randomUUID().slice(0, 8);
const uids = [`meili-cli-test-${suffix}-a`, `meili-cli-test-${suffix}-b`];

describe.skipIf(!meilisearchUp)("meili index view against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await Promise.all(uids.map((uid) => client.createIndex(uid, { primaryKey: "id" }).waitTask()));
  });

  afterAll(async () => {
    await Promise.all(uids.map((uid) => client.deleteIndex(uid).waitTask()));
  });

  it("gets one index with --id", async () => {
    const result = await runBinary([
      "index",
      "view",
      "--id",
      uids[0] ?? "",
      "--output",
      "json",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid: uids[0], primaryKey: "id" });
  });

  it("exits 4 with the API error when the --id does not exist", async () => {
    const result = await runBinary([
      "index",
      "view",
      "--id",
      `${uids[0]}-missing`,
      "--output",
      "json",
      ...project,
    ]);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });
});
