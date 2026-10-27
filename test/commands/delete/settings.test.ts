import { describe, expect, it } from "vitest";
import DeleteSettings from "../../../src/commands/delete/settings.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeEnqueuedTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const reset = makeEnqueuedTask({ taskUid: 15, type: "settingsUpdate" });

describe("meili delete settings", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["delete", "settings", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.settingsDelete(reset));
    const result = await runCommand(
      DeleteSettings,
      ["--index", "movies", "--yes", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("names the index in the path", async () => {
    server.use(meilisearchHandlers.settingsDelete(reset));
    const requests = await recordRequests(async () => {
      await runCommand(DeleteSettings, ["--index", "movies", "--yes"], { env });
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("DELETE");
    expect(requests[0]?.url.pathname).toBe("/indexes/movies/settings");
  });

  it("refuses to run without --yes, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(DeleteSettings, ["--index", "movies"], { env });
    });
    expect(requests).toBe(0);
    expect(result?.stdout).toBe("");
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_usage");
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/indexes/movies/settings", 403, invalidApiKeyError));
    const result = await runCommand(
      DeleteSettings,
      ["--index", "movies", "--yes", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
