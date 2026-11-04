import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = randomUUID();

describe.skipIf(!meilisearchUp)("meili key delete against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createKey({
      uid,
      name: `meili-cli-test-key-delete-${uid.slice(0, 8)}`,
      actions: ["search"],
      indexes: ["*"],
      expiresAt: null,
    });
  });

  it("deletes the key, writes nothing on stdout and exits 0", async () => {
    const result = await runBinary([
      "key",
      "delete",
      "--id",
      uid,
      "--yes",
      "--output",
      "json",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    const gone = await runBinary(["key", "view", "--id", uid, "--output", "json", ...project]);
    expect(gone.exitCode).toBe(4);
  });

  it("exits 4 with the API error when the key does not exist", async () => {
    const result = await runBinary([
      "key",
      "delete",
      "--id",
      randomUUID(),
      "--yes",
      "--output",
      "json",
      ...project,
    ]);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("api_key_not_found");
  });
});
