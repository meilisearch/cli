import { describe, expect, it } from "vitest";
import DocumentList from "../../../src/commands/document/list.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const documents = [
  { id: 1, title: "Nosferatu", rating: 4.5 },
  { id: 2, title: "Alien", rating: 5 },
  { id: 3, title: "Solaris", rating: 4 },
];

/** The body the CLI sent to POST /indexes/{uid}/documents/fetch, request by request. */
async function bodiesOf(argv: string[]): Promise<unknown[]> {
  const requests = await recordRequests(async () => {
    await runCommand(DocumentList, [...argv, ...project]);
  });
  return requests.map((request) => JSON.parse(request.body));
}

describe("meili document list", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["document", "list", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is in JSON", async () => {
    server.use(meilisearchHandlers.documentsFetch(documents));
    const result = await runCommand(DocumentList, ["--index", "movies", ...project]);
    expect(result).toMatchSnapshot();
  });

  describe("for a human in a terminal", () => {
    const human = { tty: true };
    const wide = Array.from({ length: 3 }, (_, index) => ({
      id: index + 1,
      title: `Movie ${index + 1}`,
      genres: ["Drama", "Comedy"],
      release_date: "1988-10-21",
      rating: 4,
      poster: "https://example.com/poster.jpg",
      cast: [{ name: "Someone" }],
    }));

    it("shows the first 4 simple attributes, and the next page with the command line typed", async () => {
      server.use(meilisearchHandlers.documentsFetch(wide));
      const result = await runCommand(
        DocumentList,
        ["-i", "movies", "--limit", "2", ...project, "--project-api-key", "secret-key"],
        human,
      );
      expect(result).toMatchSnapshot();
      expect(result.stderr).not.toContain("secret-key");
    });

    it("shows the attributes of --fields, arrays on one line, and says the last page is the last", async () => {
      server.use(meilisearchHandlers.documentsFetch(wide));
      const result = await runCommand(
        DocumentList,
        ["-i", "movies", "--fields", "id,genres", "--offset", "2", ...project],
        human,
      );
      expect(result).toMatchSnapshot();
    });

    it("says what to do when the index has no documents", async () => {
      server.use(meilisearchHandlers.documentsFetch([]));
      const empty = await runCommand(DocumentList, ["-i", "movies", ...project], human);
      expect(empty).toMatchSnapshot();
    });
  });

  it("narrows the list with --ids", async () => {
    server.use(meilisearchHandlers.documentsFetch(documents));
    const result = await runCommand(DocumentList, [
      "--index",
      "movies",
      "--ids",
      "2,3",
      ...project,
    ]);
    expect(result.exitCode).toBe(0);
    const page = JSON.parse(result.stdout) as { results: Array<{ id: number }>; total: number };
    expect(page.results.map((document) => document.id)).toEqual([2, 3]);
    expect(page.total).toBe(2);
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
      result = await runCommand(DocumentList, ["--index", "movies", "--data", "[1,2]", ...project]);
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_input_invalid");
  });

  it("refuses a --data that is not JSON, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(DocumentList, [
        "--index",
        "movies",
        "--data",
        "{nope}",
        ...project,
      ]);
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_input_invalid");
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(
      meilisearchHandlers.apiError("/indexes/movies/documents/fetch", 403, invalidApiKeyError),
    );
    const result = await runCommand(DocumentList, ["--index", "movies", ...project]);
    expect(result).toMatchSnapshot();
  });
});
