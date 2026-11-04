import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = randomUUID();
let value = "";

describe.skipIf(!meilisearchUp)("meili key view against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    const key = await client.createKey({
      uid,
      name: `meili-cli-test-key-${uid.slice(0, 8)}`,
      actions: ["search"],
      indexes: ["*"],
      expiresAt: null,
    });
    value = key.key;
  });

  afterAll(async () => {
    await client.deleteKey(uid);
  });

  it("gets one key by its uid", async () => {
    const result = await runBinary(["key", "view", "--id", uid, ...project]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid, key: value, actions: ["search"] });
  });

  it("gets the same key by its key value", async () => {
    const result = await runBinary(["key", "view", "--id", value, ...project]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid });
  });

  it("exits 4 with the API error when the key does not exist", async () => {
    const result = await runBinary(["key", "view", "--id", randomUUID(), ...project]);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("api_key_not_found");
  });
});
