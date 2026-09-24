/** Secrets never reach stderr, not even in --debug traces. */
import { describe, expect, it } from "vitest";
import Health from "../../src/commands/get/health.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../helpers/msw.js";
import { runCommand } from "../helpers/run-command.js";

useMockServer();

const SECRET = "supersecretkey1a2b";

describe("--debug", () => {
  it("traces the request and the response with the API key masked", async () => {
    server.use(meilisearchHandlers.health());
    const result = await runCommand(
      Health,
      ["--debug", "--output", "json", "--project-api-key", SECRET],
      {
        env: { MEILI_PROJECT_URL: MEILISEARCH_URL },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('{"status":"available"}\n');
    expect(result.stderr).toContain(`> GET ${MEILISEARCH_URL}/health`);
    expect(result.stderr).toContain("> authorization: Bearer ****1a2b");
    expect(result.stderr).toContain("< HTTP 200 OK");
    expect(result.stderr).toContain('< {"status":"available"}');
    expect(result.stderr).not.toContain(SECRET);
  });

  it("never prints the key from MEILI_PROJECT_API_KEY either", async () => {
    server.use(meilisearchHandlers.health());
    const result = await runCommand(Health, ["--debug", "--output", "json"], {
      env: { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: SECRET },
    });
    expect(result.stderr).not.toContain(SECRET);
    expect(result.stdout).not.toContain(SECRET);
  });
});
