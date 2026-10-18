import { describe, expect, it } from "vitest";
import CreateDocuments from "../../../src/commands/create/documents.js";
import {
  indexNotFoundError,
  MEILISEARCH_URL,
  meilisearchHandlers,
  type ReceivedRequest,
} from "../../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";
import { writeTempJson } from "../../helpers/temp-json.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const movies = '[{"id":1,"title":"Nosferatu"},{"id":2,"title":"Metropolis"}]';

describe("meili create documents", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["create", "documents", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("sends the documents of --data and prints the enqueued task as it is", async () => {
    const received: ReceivedRequest = {};
    server.use(meilisearchHandlers.addDocuments(received));
    const result = await runCommand(
      CreateDocuments,
      ["--index", "movies", "--data", movies, "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
    expect(received.body).toEqual(JSON.parse(movies));
    expect(received.query).toEqual({});
  });

  it("reads the documents from a file and passes the other flags as query parameters", async () => {
    const received: ReceivedRequest = {};
    server.use(meilisearchHandlers.addDocuments(received));
    const path = writeTempJson(JSON.parse(movies));

    const result = await runCommand(
      CreateDocuments,
      [
        "--index",
        "movies",
        "--file",
        path,
        "--primary-key",
        "id",
        "--skip-creation",
        "--custom-metadata",
        "import-42",
      ],
      { env },
    );
    expect(result.exitCode).toBe(0);
    expect(received.body).toEqual(JSON.parse(movies));
    expect(received.query).toEqual({
      primaryKey: "id",
      skipCreation: "true",
      customMetadata: "import-42",
    });
  });

  it("refuses to run without documents, with cli_usage and before any call", async () => {
    const result = await runCommand(CreateDocuments, ["--index", "movies"], { env });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("cli_usage");
  });

  it("passes the 404 of an unknown index through and exits 4", async () => {
    server.use(
      meilisearchHandlers.apiError("/indexes/nope/documents", 404, indexNotFoundError("nope")),
    );
    const result = await runCommand(
      CreateDocuments,
      ["--index", "nope", "--data", movies, "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
