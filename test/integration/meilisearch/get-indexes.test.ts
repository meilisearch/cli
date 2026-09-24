import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const suffix = randomUUID().slice(0, 8);
const uids = [`meili-cli-test-${suffix}-a`, `meili-cli-test-${suffix}-b`];

describe.skipIf(!meilisearchUp)("meili get indexes against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await Promise.all(uids.map((uid) => client.createIndex(uid, { primaryKey: "id" }).waitTask()));
  });

  afterAll(async () => {
    await Promise.all(uids.map((uid) => client.deleteIndex(uid).waitTask()));
  });

  it("returns the API envelope with the created indexes", async () => {
    const result = await runBinary(["get", "indexes", "--all", "--output", "json"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const page = JSON.parse(result.stdout) as {
      results: Array<{ uid: string; primaryKey?: string }>;
      total: number;
    };
    const ours = page.results.filter((index) => uids.includes(index.uid));
    expect(ours.map((index) => index.uid).sort()).toEqual([...uids].sort());
    expect(ours.every((index) => index.primaryKey === "id")).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(2);
  });

  it("gets one index with --id", async () => {
    const result = await runBinary(
      ["get", "indexes", "--id", uids[0] ?? "", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid: uids[0], primaryKey: "id" });
  });

  it("exits 4 with the API error when the --id does not exist", async () => {
    const result = await runBinary(
      ["get", "indexes", "--id", `${uids[0]}-missing`, "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });

  it("streams every index as ndjson with --all", async () => {
    const result = await runBinary(
      ["get", "indexes", "--all", "--limit", "1", "--output", "ndjson"],
      env,
    );
    expect(result.exitCode).toBe(0);
    const seen = result.stdout
      .trimEnd()
      .split("\n")
      .map((line) => (JSON.parse(line) as { uid: string }).uid);
    for (const uid of uids) expect(seen).toContain(uid);
  });
});
