import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = `meili-cli-test-document-list-${randomUUID().slice(0, 8)}`;
const documents = [
  { id: 1, title: "Nosferatu", rating: 4.5 },
  { id: 2, title: "Alien", rating: 5 },
  { id: 3, title: "Solaris", rating: 4 },
];

describe.skipIf(!meilisearchUp)("meili document list against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    await client
      .index(uid)
      .updateSettings({ filterableAttributes: ["rating"], sortableAttributes: ["rating"] })
      .waitTask();
    await client.index(uid).addDocuments(documents).waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  it("returns the API envelope with every document", async () => {
    const result = await runBinary([
      "document",
      "list",
      "--index",
      uid,
      "--output",
      "json",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      results: documents,
      offset: 0,
      limit: 20,
      total: 3,
    });
  });

  it("narrows the list with --ids", async () => {
    const result = await runBinary([
      "document",
      "list",
      "--index",
      uid,
      "--ids",
      "1,3",
      "--output",
      "json",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    const page = JSON.parse(result.stdout) as { results: Array<{ id: number }> };
    expect(page.results.map((document) => document.id)).toEqual([1, 3]);
  });

  it("filters, sorts and projects with --filter, --sort and --fields", async () => {
    const result = await runBinary([
      "document",
      "list",
      "--index",
      uid,
      "--filter",
      "rating > 4",
      "--sort",
      "rating:desc",
      "--fields",
      "id",
      "--output",
      "json",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    const page = JSON.parse(result.stdout) as { results: unknown[] };
    expect(page.results).toEqual([{ id: 2 }, { id: 1 }]);
  });

  it("streams every document as ndjson with --all", async () => {
    const result = await runBinary([
      "document",
      "list",
      "--index",
      uid,
      "--all",
      "--limit",
      "1",
      "--output",
      "ndjson",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines.map((line) => (JSON.parse(line) as { id: number }).id)).toEqual([1, 2, 3]);
  });

  it("exits 4 with the API error when the index does not exist", async () => {
    const result = await runBinary([
      "document",
      "list",
      "--index",
      `${uid}-missing`,
      "--output",
      "json",
      ...project,
    ]);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("index_not_found");
  });
});
