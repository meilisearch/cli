import { describe, expect, it } from "vitest";
import DocumentView from "../../../src/commands/document/view.js";
import { MEILISEARCH_URL, meilisearchHandlers } from "../../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const documents = [
  { id: 1, title: "Nosferatu", rating: 4.5 },
  { id: 2, title: "Alien", rating: 5 },
];

describe("meili document view", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["document", "view", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the document as the API returns it", async () => {
    server.use(meilisearchHandlers.document(documents));
    const result = await runCommand(DocumentView, ["--index", "movies", "--id", "2", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("prints every attribute for a human in a terminal, long text wrapped and nested values indented", async () => {
    server.use(
      meilisearchHandlers.document([
        {
          id: 11,
          title: "Star Wars",
          overview:
            "Princess Leia is captured and held hostage by the evil Imperial forces in their effort to take over the galactic Empire.",
          genres: ["Adventure", "Action", "Science Fiction"],
          rating: 4.8,
          sequel: null,
          cast: [
            { name: "Mark Hamill", character: "Luke Skywalker" },
            { name: "Harrison Ford", character: "Han Solo" },
          ],
          studio: { name: "Lucasfilm", country: "US" },
        },
      ]),
    );
    const result = await runCommand(DocumentView, ["--index", "movies", "--id", "11", ...project], {
      tty: true,
    });
    expect(result).toMatchSnapshot();
  });

  it("sends --fields and --retrieve-vectors as the query parameters of the route", async () => {
    server.use(meilisearchHandlers.document(documents));
    const requests = await recordRequests(async () => {
      await runCommand(DocumentView, [
        "--index",
        "movies",
        "--id",
        "2",
        "--fields",
        "id,title",
        "--retrieve-vectors",
        ...project,
      ]);
    });
    expect(requests[0]?.url.pathname).toBe("/indexes/movies/documents/2");
    expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({
      fields: "id,title",
      retrieveVectors: "true",
    });
  });

  it("passes the 404 of an unknown document through and exits 4", async () => {
    server.use(meilisearchHandlers.document(documents));
    const result = await runCommand(DocumentView, ["--index", "movies", "--id", "99", ...project]);
    expect(result).toMatchSnapshot();
  });
});
