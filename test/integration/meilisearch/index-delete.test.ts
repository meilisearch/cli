import { randomUUID } from "node:crypto";
import { Meilisearch } from "meilisearch";
import { beforeAll, describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];
const uid = `meili-cli-test-index-delete-${randomUUID().slice(0, 8)}`;

// The two tests share one index, in order: the first leaves it standing, the
// second deletes it, so the command under test is also the teardown.
describe.skipIf(!meilisearchUp)("meili index delete against a real Meilisearch", () => {
  const client = new Meilisearch({ host: MEILISEARCH_URL, apiKey: MASTER_KEY });

  beforeAll(async () => {
    await client.createIndex(uid).waitTask();
  });

  it("exits 2 and deletes nothing without --yes", async () => {
    const result = await runBinary(["index", "delete", "--id", uid, ...project]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
    await expect(client.index(uid).getRawInfo()).resolves.toMatchObject({ uid });
  });

  it("deletes the index", async () => {
    const result = await runBinary(["index", "delete", "--id", uid, "--yes", "--wait", ...project]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      indexUid: uid,
      type: "indexDeletion",
      status: "succeeded",
    });
    await expect(client.index(uid).getRawInfo()).rejects.toThrow();
  });
});
