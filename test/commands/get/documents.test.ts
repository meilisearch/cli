import { describe, expect, it } from "vitest";
import GetDocuments from "../../../src/commands/get/documents.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const documents = [
  { id: 1, title: "Nosferatu", rating: 4.5 },
  { id: 2, title: "Alien", rating: 5 },
  { id: 3, title: "Solaris", rating: 4 },
];

/** The body the CLI sent to POST /indexes/{uid}/documents/fetch, request by request. */
async function bodiesOf(argv: string[]): Promise<unknown[]> {
  const requests = await recordRequests(async () => {
    await runCommand(GetDocuments, argv, { env });
  });
  return requests.map((request) => JSON.parse(request.body));
}

describe("meili get documents", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "documents", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is in JSON", async () => {
    server.use(meilisearchHandlers.documentsFetch(documents));
    const result = await runCommand(GetDocuments, ["--index", "movies", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });

  it("narrows the list with --ids, and --id is the same flag", async () => {
    server.use(meilisearchHandlers.documentsFetch(documents));
    for (const flag of ["--ids", "--id"]) {
      const result = await runCommand(GetDocuments, ["--index", "movies", flag, "2,3"], { env });
      expect(result.exitCode).toBe(0);
      const page = JSON.parse(result.stdout) as { results: Array<{ id: number }>; total: number };
      expect(page.results.map((document) => document.id)).toEqual([2, 3]);
      expect(page.total).toBe(2);
    }
  });

  it("sends the query flags in the body of the fetch route", async () => {
    server.use(meilisearchHandlers.documentsFetch(documents));
    const bodies = await bodiesOf([
      "--index",
      "movies",
      "--filter",
      "rating > 4",
      "--fields",
      "id,title",
      "--sort",
      "rating:desc",
      "--retrieve-vectors",
      "--limit",
      "2",
      "--offset",
      "1",
    ]);
    expect(bodies).toEqual([
      {
        filter: "rating > 4",
        fields: ["id", "title"],
        sort: ["rating:desc"],
        retrieveVectors: true,
        limit: 2,
        offset: 1,
      },
    ]);
  });

  it("takes the body from --data, which a flag of the same field overrides", async () => {
    server.use(meilisearchHandlers.documentsFetch(documents));
    expect(
      await bodiesOf([
        "--index",
        "movies",
        "--data",
        '{"filter":[["genres = horror","genres = scifi"]],"limit":5}',
      ]),
    ).toEqual([{ filter: [["genres = horror", "genres = scifi"]], limit: 5 }]);
    expect(await bodiesOf(["--index", "movies", "--data", '{"limit":5}', "--limit", "1"])).toEqual([
      { limit: 1 },
    ]);
  });

  it("refuses a --data that is not the query object, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(GetDocuments, ["--index", "movies", "--data", "[1,2]"], { env });
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_input_invalid");
  });

  it("refuses a --data that is not JSON, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(GetDocuments, ["--index", "movies", "--data", "{nope}"], { env });
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_input_invalid");
  });

  it("prints one document per line in ndjson", async () => {
    server.use(meilisearchHandlers.documentsFetch(documents));
    const result = await runCommand(GetDocuments, ["--index", "movies", "--output", "ndjson"], {
      env,
    });
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => (JSON.parse(line) as { id: number }).id)).toEqual([1, 2, 3]);
  });

  it("follows every page with --all and merges them into one envelope in JSON", async () => {
    server.use(meilisearchHandlers.documentsFetch(documents));
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(
        GetDocuments,
        ["--index", "movies", "--all", "--limit", "2", "--output", "json"],
        { env },
      );
    });
    expect(requests).toBe(2);
    expect(result?.exitCode).toBe(0);
    expect(JSON.parse(result?.stdout ?? "")).toEqual({ results: documents, total: 3 });
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(
      meilisearchHandlers.apiError("/indexes/movies/documents/fetch", 403, invalidApiKeyError),
    );
    const result = await runCommand(GetDocuments, ["--index", "movies", "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });
});
