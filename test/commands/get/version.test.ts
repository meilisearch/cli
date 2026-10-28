import { describe, expect, it } from "vitest";
import GetVersion from "../../../src/commands/get/version.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };

describe("meili get version", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "version", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the version as the API returned it", async () => {
    server.use(meilisearchHandlers.version());
    const result = await runCommand(GetVersion, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("passes the API error of a key the instance refuses through and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/version", 403, invalidApiKeyError));
    const result = await runCommand(GetVersion, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
