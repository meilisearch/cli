import { describe, expect, it } from "vitest";
import UpdateDocuments from "../../../src/commands/update/documents.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  meilisearchHandlers,
  type ReceivedRequest,
} from "../../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const partial = '[{"id":1,"rating":9}]';

describe("meili update documents", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["update", "documents", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("sends the partial documents on the PUT route and prints the enqueued task", async () => {
    const received: ReceivedRequest = {};
    server.use(meilisearchHandlers.updateDocuments(received));
    const result = await runCommand(
      UpdateDocuments,
      ["--index", "movies", "--data", partial, "--primary-key", "id", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
    expect(received.body).toEqual(JSON.parse(partial));
    expect(received.query).toEqual({ primaryKey: "id" });
  });

  it("passes an authentication error through and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/indexes/movies/documents", 403, invalidApiKeyError));
    const result = await runCommand(
      UpdateDocuments,
      ["--index", "movies", "--data", partial, "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
