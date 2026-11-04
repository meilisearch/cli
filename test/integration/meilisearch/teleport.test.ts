/**
 * `meili teleport` asks questions and needs Meilisearch Cloud, so only its
 * check of the source runs here: `POST /export` without a body, which must
 * tell a key that can export from one that cannot, and export nothing.
 */
import { MeilisearchApiError, type TaskType } from "meilisearch";
import { describe, expect, it } from "vitest";
import { createMeilisearchClient, probeExport } from "../../../src/lib/clients/meilisearch.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

/** meilisearch-js has no `export` task type yet (meilisearch/meilisearch-js#1989). */
const exportType = "export" as TaskType;

const client = (apiKey: string) =>
  createMeilisearchClient({ url: MEILISEARCH_URL, apiKey, userAgent: "meili-cli (test)" });

describe.skipIf(!meilisearchUp)(
  "the source check of meili teleport against a real Meilisearch",
  () => {
    it("accepts the master key and enqueues no export task", async () => {
      const before = await client(MASTER_KEY).tasks.getTasks({ types: [exportType], limit: 1 });
      await expect(probeExport(client(MASTER_KEY))).resolves.toBeUndefined();
      const after = await client(MASTER_KEY).tasks.getTasks({ types: [exportType], limit: 1 });
      expect(after.total).toBe(before.total);
    });

    it("throws the 403 of a wrong key", async () => {
      const error = await probeExport(client("wrong-key")).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MeilisearchApiError);
      expect((error as MeilisearchApiError).response.status).toBe(403);
    });
  },
);
