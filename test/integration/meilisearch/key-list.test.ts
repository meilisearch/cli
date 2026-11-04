import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = randomUUID();
let value = "";

describe.skipIf(!meilisearchUp)("meili key list against a real Meilisearch", () => {
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

  it("lists the keys with their key value, which the CLI does not mask", async () => {
    const result = await runBinary(["key", "list", "--all", "--output", "json", ...project]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const page = JSON.parse(result.stdout) as { results: Array<{ uid: string; key: string }> };
    expect(page.results.map((key) => key.uid)).toContain(uid);
    expect(page.results.find((key) => key.uid === uid)?.key).toBe(value);
  });
});
