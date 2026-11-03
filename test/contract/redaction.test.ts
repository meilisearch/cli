/** Secrets never reach stderr, not even in --debug traces. */
import { describe, expect, it } from "vitest";
import AddProjects from "../../src/commands/add/projects.js";
import Health from "../../src/commands/get/health.js";
import { MANAGEMENT_URL, managementHandlers, project } from "../helpers/management-handlers.js";
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

  it("masks the management token and the project's masterKey in the trace and on stdout", async () => {
    server.use(managementHandlers.createProject());
    const result = await runCommand(
      AddProjects,
      ["--debug", "--name", "demo", "--output", "json"],
      {
        env: { MEILI_MANAGEMENT_TOKEN: SECRET, MEILI_MANAGEMENT_URL: MANAGEMENT_URL },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(`> POST ${MANAGEMENT_URL}/api/v2/projects`);
    expect(result.stderr).toContain("> authorization: Bearer ****1a2b");
    expect(result.stderr).toContain('> {"name":"demo"}');
    expect(result.stderr).toContain('"masterKey":"****9z8y"');
    expect(result.stderr).not.toContain(SECRET);
    expect(result.stderr).not.toContain(project.masterKey);
    // Only --show-secrets prints it in full (ADR 0013).
    expect(result.stdout).not.toContain(project.masterKey);
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
