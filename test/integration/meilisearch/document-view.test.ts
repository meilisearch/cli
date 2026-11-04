import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = `meili-cli-test-document-view-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili document view against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    await client
      .index(uid)
      .addDocuments([{ id: 1, title: "Nosferatu", rating: 4.5 }])
      .waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("prints the document with the fields --fields keeps", async () => {
    const result = await runBinary([
      "document",
      "view",
      "--index",
      uid,
      "--id",
      "1",
      "--fields",
      "id,title",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ id: 1, title: "Nosferatu" });
  });

  it("exits 4 with the API error when the document does not exist", async () => {
    const result = await runBinary(["document", "view", "--index", uid, "--id", "2", ...project]);
    expect(result.exitCode).toBe(4);
    expect(JSON.parse(result.stderr).error.code).toBe("document_not_found");
  });
});
