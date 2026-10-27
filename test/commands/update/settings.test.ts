import { describe, expect, it } from "vitest";
import UpdateSettings from "../../../src/commands/update/settings.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeEnqueuedTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const updated = makeEnqueuedTask({ taskUid: 14, type: "settingsUpdate" });

/** The path and the body the command sent to `PATCH /indexes/{uid}/settings`. */
async function sent(argv: string[]): Promise<{ pathname: string; body: unknown }> {
  server.use(meilisearchHandlers.settingsUpdate(updated));
  const requests = await recordRequests(async () => {
    await runCommand(UpdateSettings, ["--index", "movies", ...argv], { env });
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.method).toBe("PATCH");
  return {
    pathname: requests[0]?.url.pathname ?? "",
    body: JSON.parse(requests[0]?.body ?? ""),
  };
}

describe("meili update settings", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["update", "settings", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.settingsUpdate(updated));
    const result = await runCommand(
      UpdateSettings,
      ["--index", "movies", "--searchable-attributes", "title,overview", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("names the index in the path and sends only the settings given", async () => {
    expect(await sent(["--searchable-attributes", "title,overview"])).toEqual({
      pathname: "/indexes/movies/settings",
      body: { searchableAttributes: ["title", "overview"] },
    });
  });

  it("splits a list on commas and sends a scalar, a number and a boolean as they are", async () => {
    const { body } = await sent([
      "--stop-words",
      "the,a",
      "--distinct-attribute",
      "sku",
      "--search-cutoff-ms",
      "150",
      "--facet-search",
      "false",
    ]);
    expect(body).toEqual({
      stopWords: ["the", "a"],
      distinctAttribute: "sku",
      searchCutoffMs: 150,
      facetSearch: false,
    });
  });

  it("sends the JSON of an object setting, parsed", async () => {
    const { body } = await sent([
      "--typo-tolerance",
      '{"enabled":false}',
      "--synonyms",
      '{"phone":["iPhone"]}',
      "--chat",
      '{"description":"A movie database"}',
    ]);
    expect(body).toEqual({
      typoTolerance: { enabled: false },
      synonyms: { phone: ["iPhone"] },
      chat: { description: "A movie database" },
    });
  });

  it("resets a setting with the value null, whatever its type", async () => {
    const { body } = await sent([
      "--stop-words",
      "null",
      "--distinct-attribute",
      "null",
      "--search-cutoff-ms",
      "null",
      "--typo-tolerance",
      "null",
    ]);
    expect(body).toEqual({
      stopWords: null,
      distinctAttribute: null,
      searchCutoffMs: null,
      typoTolerance: null,
    });
  });

  it("sends the fields of --data, and lets the flags override the ones it carries", async () => {
    const { body } = await sent([
      "--data",
      '{"stopWords":["the"],"searchableAttributes":["title"]}',
      "--searchable-attributes",
      "overview",
    ]);
    expect(body).toEqual({ stopWords: ["the"], searchableAttributes: ["overview"] });
  });

  it("sends a value that does not convert as the text it was given, for the API to refuse", async () => {
    const { body } = await sent([
      "--search-cutoff-ms",
      "soon",
      "--faceting",
      "{nope}",
      "--proximity-precision",
      "byWord",
    ]);
    expect(body).toEqual({
      searchCutoffMs: "soon",
      faceting: "{nope}",
      proximityPrecision: "byWord",
    });
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/indexes/movies/settings", 403, invalidApiKeyError));
    const result = await runCommand(
      UpdateSettings,
      ["--index", "movies", "--stop-words", "the", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
