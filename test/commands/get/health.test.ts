import { join } from "node:path";
import { describe, expect, it } from "vitest";
import GetHealth from "../../../src/commands/get/health.js";
import { writeConfigFile } from "../../../src/lib/config.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand, scrubbedHome } from "../../helpers/run-command.js";

useMockServer();

describe("meili get health", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "health", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the health of the instance as JSON", async () => {
    server.use(meilisearchHandlers.health());
    const result = await runCommand(GetHealth, ["--output", "json"], {
      env: { MEILI_PROJECT_URL: MEILISEARCH_URL },
    });
    expect(result).toMatchSnapshot();
  });

  it("takes the URL from --project-url over MEILI_PROJECT_URL", async () => {
    server.use(meilisearchHandlers.health("http://flag.test:7700"));
    const result = await runCommand(
      GetHealth,
      ["--project-url", "http://flag.test:7700", "--output", "json"],
      {
        env: { MEILI_PROJECT_URL: "http://env.test:7700" },
      },
    );
    expect(result).toEqual({ stdout: '{"status":"available"}\n', stderr: "", exitCode: 0 });
  });

  it("takes the project named by --project from the config file", async () => {
    // Not the scrubbed default path: the other tests of this file must see no project.
    const path = join(scrubbedHome, "projects.json");
    writeConfigFile({
      path,
      projects: { local: { url: "http://nowhere.test" }, prod: { url: MEILISEARCH_URL } },
    });
    server.use(meilisearchHandlers.health());
    const result = await runCommand(GetHealth, ["--project", "prod", "--output", "json"], {
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
    const result = await runCommand(GetHealth, ["--output", "json"], {
      env: { MEILI_PROJECT_URL: MEILISEARCH_URL },
    });
    expect(result).toMatchSnapshot();
  });

  it("reports a connection failure with cli_network and exits 6", async () => {
    server.use(meilisearchHandlers.networkError("/health"));
    const result = await runCommand(GetHealth, ["--output", "json"], {
      env: { MEILI_PROJECT_URL: MEILISEARCH_URL },
    });
    expect(result).toMatchSnapshot();
  });

  it("fails with cli_config and exits 2 when no project is configured", async () => {
    const result = await runCommand(GetHealth, ["--output", "json"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr).error as { code: string; message: string };
    expect(error.code).toBe("cli_config");
    expect(error.message).toMatch(
      /^No project configured\. .*`--project-url`.*`MEILI_PROJECT_URL`.*config\.json\.$/,
    );
    expect(result.stderr).not.toContain("MEILI_MANAGEMENT_TOKEN");
  });

  it("rejects ndjson, which is for list routes only", async () => {
    server.use(meilisearchHandlers.health());
    const result = await runCommand(GetHealth, ["--output", "ndjson"], {
      env: { MEILI_PROJECT_URL: MEILISEARCH_URL },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });

  it("rejects an unexpected argument with cli_usage", async () => {
    const result = await runCommand(GetHealth, ["extra", "--output", "json"], {
      env: { MEILI_PROJECT_URL: MEILISEARCH_URL },
    });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });
});
