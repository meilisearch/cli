import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Health from "../../src/commands/health.js";
import { writeConfigFile } from "../../src/lib/config.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../helpers/msw.js";
import { runCli, runCommand, scrubbedHome } from "../helpers/run-command.js";

useMockServer();

describe("meili health", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["health", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the health of the instance as JSON", async () => {
    server.use(meilisearchHandlers.health());
    const result = await runCommand(Health, ["--project-url", MEILISEARCH_URL]);
    expect(result).toMatchSnapshot();
  });

  it("takes the project named by --project from the config file", async () => {
    const path = join(scrubbedHome, "projects.json");
    writeConfigFile({
      path,
      projects: { local: { url: "http://nowhere.test" }, prod: { url: MEILISEARCH_URL } },
    });
    server.use(meilisearchHandlers.health());
    const result = await runCommand(Health, ["--project", "prod"], {
      env: { MEILI_CONFIG: path },
    });
    expect(result).toEqual({ stdout: '{"status":"available"}\n', stderr: "", exitCode: 0 });
  });

  it("passes an API error through and exits 1", async () => {
    server.use(
      meilisearchHandlers.apiError("/health", 500, {
        message: "An internal error has occurred. `Index creation` failed.",
        code: "internal",
        type: "internal",
        link: "https://docs.meilisearch.com/errors#internal",
      }),
    );
    const result = await runCommand(Health, ["--project-url", MEILISEARCH_URL]);
    expect(result).toMatchSnapshot();
  });

  it("reports a connection failure with cli_network and exits 6", async () => {
    server.use(meilisearchHandlers.networkError("/health"));
    const result = await runCommand(Health, ["--project-url", MEILISEARCH_URL]);
    expect(result).toMatchSnapshot();
  });

  it("fails with cli_usage and exits 2 without --project or --project-url", async () => {
    // A file with one project is never taken without --project, nor is a variable.
    const path = join(scrubbedHome, "one-project.json");
    writeConfigFile({ path, projects: { prod: { url: MEILISEARCH_URL } } });
    const result = await runCommand(Health, [], {
      env: { MEILI_CONFIG: path, MEILI_PROJECT_URL: MEILISEARCH_URL },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "cli_usage",
      hint: "Run `meili config list` to see the projects of the config file.",
    });
    expect(result.stderr).not.toContain("MEILI_MANAGEMENT_TOKEN");
  });

  it("rejects an unexpected argument with cli_usage", async () => {
    const result = await runCommand(Health, ["extra", "--project-url", MEILISEARCH_URL]);
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });
});
