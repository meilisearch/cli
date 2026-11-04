import type { Version } from "meilisearch";
import { describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const project = ["--project-url", MEILISEARCH_URL, "--project-api-key", MASTER_KEY];

describe.skipIf(!meilisearchUp)("meili info against a real Meilisearch", () => {
  it("returns the version of the instance as the API wrote it", async () => {
    const result = await runBinary(["info", "--output", "json", ...project]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const body = JSON.parse(result.stdout) as Version;
    expect(body.pkgVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.commitSha).toBeTypeOf("string");
  });

  it("exits 3 with the API error when the key is not accepted, unlike health", async () => {
    const result = await runBinary([
      "info",
      "--project-url",
      MEILISEARCH_URL,
      "--project-api-key",
      "not-the-master-key",
      "--output",
      "json",
    ]);
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("invalid_api_key");
  });
});
