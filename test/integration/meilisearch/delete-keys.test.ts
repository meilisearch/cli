import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = randomUUID();

describe.skipIf(!meilisearchUp)("meili delete keys against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createKey({
      uid,
      name: `meili-cli-test-delete-keys-${uid.slice(0, 8)}`,
      actions: ["search"],
      indexes: ["*"],
      expiresAt: null,
    });
  });

  it("deletes the key, writes nothing on stdout and exits 0", async () => {
    const result = await runBinary(
      ["delete", "keys", "--id", uid, "--yes", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    const gone = await runBinary(["get", "keys", "--id", uid, "--output", "json"], env);
    expect(gone.exitCode).toBe(4);
  });

  it("exits 4 with the API error when the key does not exist", async () => {
    const result = await runBinary(
      ["delete", "keys", "--id", randomUUID(), "--yes", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("api_key_not_found");
  });
});
