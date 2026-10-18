import { describe, expect, it } from "vitest";
import GetDocuments from "../../../src/commands/get/documents.js";
import {
  indexNotFoundError,
  MEILISEARCH_URL,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const five = [1, 2, 3, 4, 5].map((id) => ({ id, title: `Movie ${id}`, year: 1920 + id }));

describe("meili get documents", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "documents", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is", async () => {
    server.use(meilisearchHandlers.fetchDocuments(five.slice(0, 2)));
    const result = await runCommand(GetDocuments, ["--index", "movies", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });

  it("sends every selector in the body of the fetch route", async () => {
    const received: { body?: unknown } = {};
    server.use(meilisearchHandlers.fetchDocuments(five, received));
    const result = await runCommand(
      GetDocuments,
      [
        "--index",
        "movies",
        "--ids",
        "1,2",
        "--fields",
        "id,title",
        "--sort",
        "year:asc",
        "--retrieve-vectors",
        "--limit",
        "2",
        "--offset",
        "1",
      ],
      { env },
    );
    expect(result.exitCode).toBe(0);
    expect(received.body).toEqual({
      ids: ["1", "2"],
      fields: ["id", "title"],
      sort: ["year:asc"],
      retrieveVectors: true,
      limit: 2,
      offset: 1,
    });
  });

  it("accepts --id as an alias of --ids, since the route has no unit twin", async () => {
    const received: { body?: unknown } = {};
    server.use(meilisearchHandlers.fetchDocuments(five, received));
    const result = await runCommand(GetDocuments, ["--index", "movies", "--id", "3"], { env });
    expect(result.exitCode).toBe(0);
    expect(received.body).toEqual({ ids: ["3"] });
    const page = JSON.parse(result.stdout) as { results: Array<{ id: number }> };
    expect(page.results.map((document) => document.id)).toEqual([3]);
  });

  it("keeps the fields of --data that no flag covers", async () => {
    const received: { body?: unknown } = {};
    server.use(meilisearchHandlers.fetchDocuments(five, received));
    await runCommand(
      GetDocuments,
      ["--index", "movies", "--data", '{"filter":"year > 1920","limit":3}', "--limit", "2"],
      { env },
    );
    expect(received.body).toEqual({ filter: "year > 1920", limit: 2 });
  });

  it("follows every page with --all and merges them into one envelope", async () => {
    server.use(meilisearchHandlers.fetchDocuments(five));
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(
        GetDocuments,
        ["--index", "movies", "--all", "--limit", "2", "--output", "json"],
        { env },
      );
    });
    expect(requests).toBe(3);
    expect(JSON.parse(result?.stdout ?? "")).toEqual({ results: five, total: 5 });
  });

  it("passes the 404 of an unknown index through and exits 4", async () => {
    server.use(
      meilisearchHandlers.apiError(
        "/indexes/nope/documents/fetch",
        404,
        indexNotFoundError("nope"),
      ),
    );
    const result = await runCommand(GetDocuments, ["--index", "nope", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
