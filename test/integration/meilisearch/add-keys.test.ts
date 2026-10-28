import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const created: string[] = [];

describe.skipIf(!meilisearchUp)("meili add keys against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  afterAll(async () => {
    for (const uid of created) await client.deleteKey(uid);
  });

  it("creates a key from the flags and answers it with its key value", async () => {
    const uid = randomUUID();
    const result = await runBinary(
      [
        "add",
        "keys",
        "--id",
        uid,
        "--actions",
        "search,documents.add",
        "--indexes",
        "movies",
        "--expires-at",
        "null",
        "--name",
        `meili-cli-test-add-keys-${uid.slice(0, 8)}`,
        "--output",
        "json",
      ],
      env,
    );
    created.push(uid);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const key = JSON.parse(result.stdout) as { uid: string; key: string; actions: string[] };
    expect(key).toMatchObject({
      uid,
      actions: ["search", "documents.add"],
      indexes: ["movies"],
      expiresAt: null,
    });
    expect(key.key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("creates a key from --data alone", async () => {
    const uid = randomUUID();
    const result = await runBinary(
      [
        "add",
        "keys",
        "--data",
        JSON.stringify({ uid, actions: ["search"], indexes: ["*"], expiresAt: null }),
        "--output",
        "json",
      ],
      env,
    );
    created.push(uid);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid, actions: ["search"] });
  });

  it("exits 1 with the API error when the body misses a required field", async () => {
    const result = await runBinary(["add", "keys", "--actions", "search", "--output", "json"], env);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("missing_api_key_indexes");
  });
});
