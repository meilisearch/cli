import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = randomUUID();
let value = "";

describe.skipIf(!meilisearchUp)("meili get keys against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    const key = await client.createKey({
      uid,
      name: `meili-cli-test-get-keys-${uid.slice(0, 8)}`,
      actions: ["search"],
      indexes: ["*"],
      expiresAt: null,
    });
    value = key.key;
  });

  afterAll(async () => {
    await client.deleteKey(uid);
  });

  it("lists the keys with their key value, which the CLI does not mask", async () => {
    const result = await runBinary(["get", "keys", "--all", "--output", "json"], env);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const page = JSON.parse(result.stdout) as { results: Array<{ uid: string; key: string }> };
    expect(page.results.map((key) => key.uid)).toContain(uid);
    expect(page.results.find((key) => key.uid === uid)?.key).toBe(value);
  });

  it("gets one key by its uid", async () => {
    const result = await runBinary(["get", "keys", "--id", uid, "--output", "json"], env);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid, key: value, actions: ["search"] });
  });

  it("gets the same key by its key value", async () => {
    const result = await runBinary(["get", "keys", "--id", value, "--output", "json"], env);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid });
  });

  it("exits 4 with the API error when the key does not exist", async () => {
    const result = await runBinary(["get", "keys", "--id", randomUUID(), "--output", "json"], env);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("api_key_not_found");
  });
});
