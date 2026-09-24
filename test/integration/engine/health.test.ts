import { describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { ENGINE_URL, engineAvailable, MASTER_KEY } from "./setup.js";

const engineUp = await engineAvailable();

const env = { MEILI_URL: ENGINE_URL, MEILI_API_KEY: MASTER_KEY };

describe.skipIf(!engineUp)("meili health against a real Meilisearch", () => {
  it("prints the health as compact JSON on stdout and nothing on stderr", async () => {
    const result = await runBinary(["health", "--output", "json"], env);
    expect(result).toEqual({ stdout: '{"status":"available"}\n', stderr: "", exitCode: 0 });
  });

  it("prints compact JSON by default when stdout is not a TTY", async () => {
    const result = await runBinary(["health"], env);
    expect(result.stdout).toBe('{"status":"available"}\n');
    expect(result.exitCode).toBe(0);
  });

  it("prints a table on request", async () => {
    const result = await runBinary(["health", "--output", "table"], env);
    expect(result.stdout).toBe("status  available\n");
    expect(result.exitCode).toBe(0);
  });

  it("works without an API key, since /health is public", async () => {
    const result = await runBinary(["health", "--output", "json"], { MEILI_URL: ENGINE_URL });
    expect(result.exitCode).toBe(0);
  });

  it("exits 6 with cli_network on stderr when nothing listens, and keeps stdout empty", async () => {
    const result = await runBinary(
      ["health", "--url", "http://127.0.0.1:1", "--output", "json"],
      env,
    );
    expect(result.exitCode).toBe(6);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr) as { error: { code: string; type: string } };
    expect(error.error).toMatchObject({ code: "cli_network", type: "cli" });
  });

  it("exits 2 with cli_config when no URL is configured", async () => {
    const result = await runBinary(["health", "--output", "json"], {});
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_config");
  });
});
