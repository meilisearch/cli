import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
const uid = `meili-cli-test-update-indexes-${randomUUID().slice(0, 8)}`;
const renamed = `${uid}-renamed`;

describe.skipIf(!meilisearchUp)("meili update indexes against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid).waitTask();
  });

  afterAll(async () => {
    await client.deleteIndex(renamed).waitTask();
  });

  it("sets the primary key of the index", async () => {
    const result = await runBinary(
      ["update", "indexes", "--id", uid, "--primary-key", "id", "--wait", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      indexUid: uid,
      type: "indexUpdate",
      status: "succeeded",
    });
    expect(await client.index(uid).getRawInfo()).toMatchObject({ primaryKey: "id" });
  });

  it("renames the index with --new-id", async () => {
    const result = await runBinary(
      ["update", "indexes", "--id", uid, "--new-id", renamed, "--wait", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(await client.index(renamed).getRawInfo()).toMatchObject({ uid: renamed });
  });

  it("prints the failed task and exits 7 when the index does not exist", async () => {
    const result = await runBinary(
      [
        "update",
        "indexes",
        "--id",
        `${uid}-missing`,
        "--primary-key",
        "id",
        "--wait",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(7);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "failed",
      error: { code: "index_not_found" },
    });
    expect(JSON.parse(result.stderr).error.code).toBe("cli_task_failed");
  });
});
