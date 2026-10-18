import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili update documents against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    await client
      .index(uid)
      .addDocuments([{ id: 1, title: "Nosferatu", rating: 7 }])
      .waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("merges the given fields into the stored document", async () => {
    const result = await runBinary(
      [
        "update",
        "documents",
        "--index",
        uid,
        "--data",
        '[{"id":1,"rating":9}]',
        "--wait",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe("succeeded");
    expect(await client.index(uid).getDocument(1)).toEqual({
      id: 1,
      title: "Nosferatu",
      rating: 9,
    });
  });
});
