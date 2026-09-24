import { describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };

describe.skipIf(!meilisearchUp)("meili get health against a real Meilisearch", () => {
  it("prints the health as compact JSON on stdout and nothing on stderr", async () => {
    const result = await runBinary(["get", "health"], env);
    expect(result).toEqual({ stdout: '{"status":"available"}\n', stderr: "", exitCode: 0 });
  });

  it("works without an API key, since /health is public", async () => {
    const result = await runBinary(["get", "health", "--output", "json"], {
      MEILI_PROJECT_URL: MEILISEARCH_URL,
    });
    expect(result.exitCode).toBe(0);
  });

  it("exits 6 with cli_network on stderr when nothing listens, and keeps stdout empty", async () => {
    const result = await runBinary(
      ["get", "health", "--project-url", "http://127.0.0.1:1", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(6);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr) as { error: { code: string; type: string } };
    expect(error.error).toMatchObject({ code: "cli_network", type: "cli" });
  });

  it("suggests the closest command on a typo, with exit 2", async () => {
    const result = await runBinary(["get", "helth"], env);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr) as { error: { code: string; hint: string } };
    expect(error.error.code).toBe("cli_usage");
    expect(error.error.hint).toBe("Did you mean `meili get health`?");
  });
});
