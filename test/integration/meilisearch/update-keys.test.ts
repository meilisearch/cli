import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = randomUUID();

describe.skipIf(!meilisearchUp)("meili update keys against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createKey({
      uid,
      name: `meili-cli-test-update-keys-${uid.slice(0, 8)}`,
      description: "Before the update",
      actions: ["search"],
      indexes: ["*"],
      expiresAt: null,
    });
  });

  afterAll(async () => {
    await client.deleteKey(uid);
  });

  it("changes the name and answers the key as the API returns it", async () => {
    const name = `meili-cli-test-renamed-${uid.slice(0, 8)}`;
    const result = await runBinary(
      ["update", "keys", "--id", uid, "--name", name, "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({ uid, name });
  });

  it("removes the description with the value null", async () => {
    const result = await runBinary(
      ["update", "keys", "--id", uid, "--description", "null", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid, description: null });
  });

  it("exits 4 with the API error when the key does not exist", async () => {
    const result = await runBinary(
      ["update", "keys", "--id", randomUUID(), "--name", "nope", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("api_key_not_found");
  });
});
