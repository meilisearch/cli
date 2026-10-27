import type { Settings } from "meilisearch";
import { describe, expect, it } from "vitest";
import GetSettings from "../../../src/commands/get/settings.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };

/** A settings body with one of each shape: lists, a map, a scalar and an object. */
const settings: Settings = {
  displayedAttributes: ["*"],
  searchableAttributes: ["title", "overview"],
  filterableAttributes: ["genres"],
  sortableAttributes: [],
  rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
  stopWords: ["the"],
  synonyms: { phone: ["iPhone"] },
  distinctAttribute: null,
  typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 } },
  pagination: { maxTotalHits: 1000 },
  searchCutoffMs: null,
  facetSearch: true,
  prefixSearch: "indexingTime",
};

describe("meili get settings", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "settings", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the settings as the API returned them", async () => {
    server.use(meilisearchHandlers.settings(settings));
    const result = await runCommand(GetSettings, ["--index", "movies", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });

  it("names the index in the path", async () => {
    server.use(meilisearchHandlers.settings(settings));
    const requests = await recordRequests(async () => {
      await runCommand(GetSettings, ["--index", "movies"], { env });
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("GET");
    expect(requests[0]?.url.pathname).toBe("/indexes/movies/settings");
  });

  it("passes the API error of a missing index through and exits 4", async () => {
    server.use(
      meilisearchHandlers.apiError("/indexes/missing/settings", 404, {
        message: "Index `missing` not found.",
        code: "index_not_found",
        type: "invalid_request",
        link: "https://docs.meilisearch.com/errors#index_not_found",
      }),
    );
    const result = await runCommand(GetSettings, ["--index", "missing", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });
});
