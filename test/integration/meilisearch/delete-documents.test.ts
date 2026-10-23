import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-delete-documents-${randomUUID().slice(0, 8)}`;
const documents = [
  { id: 1, title: "Nosferatu", rating: 4.5 },
  { id: 2, title: "Alien", rating: 5 },
  { id: 3, title: "Solaris", rating: 1 },
];
const idsFile = join(mkdtempSync(join(tmpdir(), "meili-cli-test-")), "ids.json");
writeFileSync(idsFile, "[1,2]");

describe.skipIf(!meilisearchUp)("meili delete documents against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  /** Each test starts from the same three documents. */
  beforeEach(async () => {
    await client.createIndex(uid, { primaryKey: "id" }).waitTask();
    await client.index(uid).updateFilterableAttributes(["rating"]).waitTask();
    await client.index(uid).deleteAllDocuments().waitTask();
    await client.index(uid).addDocuments(documents).waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask();
  });

  const remainingIds = async (): Promise<number[]> => {
    const page = await client.index(uid).getDocuments<{ id: number }>({ limit: 10 });
    return page.results.map((document) => document.id);
  };

  it("deletes the documents named by --ids", async () => {
    const result = await runBinary(
      [
        "delete",
        "documents",
        "--index",
        uid,
        "--ids",
        "1,2",
        "--yes",
        "--wait",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "succeeded" });
    expect(await remainingIds()).toEqual([3]);
  });

  it("deletes the documents matched by --filter", async () => {
    const result = await runBinary(
      [
        "delete",
        "documents",
        "--index",
        uid,
        "--filter",
        "rating < 2",
        "--yes",
        "--wait",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(await remainingIds()).toEqual([1, 2]);
  });

  it("reads the identifiers from a file, which selects the delete-batch route", async () => {
    const result = await runBinary(
      [
        "delete",
        "documents",
        "--index",
        uid,
        "--file",
        idsFile,
        "--yes",
        "--wait",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ type: "documentDeletion" });
    expect(await remainingIds()).toEqual([3]);
  });

  it("deletes every document with --all", async () => {
    const result = await runBinary(
      ["delete", "documents", "--index", uid, "--all", "--yes", "--wait", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(await remainingIds()).toEqual([]);
  });

  it("exits 2 and deletes nothing without --yes", async () => {
    const result = await runBinary(
      ["delete", "documents", "--index", uid, "--all", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
    expect(await remainingIds()).toEqual([1, 2, 3]);
  });

  it("exits 2 and deletes nothing without a selector", async () => {
    const result = await runBinary(
      ["delete", "documents", "--index", uid, "--yes", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
    expect(await remainingIds()).toEqual([1, 2, 3]);
  });
});
