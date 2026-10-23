import { describe, expect, it } from "vitest";
import UpdateIndexes from "../../../src/commands/update/indexes.js";
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
const updated = makeEnqueuedTask({ taskUid: 12, type: "indexUpdate" });

/** The path and the body the command sent to `PATCH /indexes/{uid}`. */
async function sent(argv: string[]): Promise<{ pathname: string; body: unknown }> {
  server.use(meilisearchHandlers.indexUpdate(updated));
  const requests = await recordRequests(async () => {
    await runCommand(UpdateIndexes, argv, { env });
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.method).toBe("PATCH");
  return {
    pathname: requests[0]?.url.pathname ?? "",
    body: JSON.parse(requests[0]?.body ?? ""),
  };
}

describe("meili update indexes", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["update", "indexes", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.indexUpdate(updated));
    const result = await runCommand(
      UpdateIndexes,
      ["--id", "movies", "--primary-key", "movie_id", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("names the index in the path and sends the new primary key in the body", async () => {
    expect(await sent(["--id", "movies", "--primary-key", "movie_id"])).toEqual({
      pathname: "/indexes/movies",
      body: { primaryKey: "movie_id" },
    });
  });

  it("renames the index with --new-id, which carries the new uid", async () => {
    expect(await sent(["--id", "movies", "--new-id", "films"])).toEqual({
      pathname: "/indexes/movies",
      body: { uid: "films" },
    });
  });

  it("accepts --uid, the API spelling of --new-id", async () => {
    expect((await sent(["--id", "movies", "--uid", "films"])).body).toEqual({ uid: "films" });
  });

  it("sends the fields of --data, and lets the flags override the ones it carries", async () => {
    const { body } = await sent([
      "--id",
      "movies",
      "--data",
      '{"primaryKey":"isbn","uid":"books"}',
      "--new-id",
      "films",
    ]);
    expect(body).toEqual({ primaryKey: "isbn", uid: "films" });
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/indexes/movies", 403, invalidApiKeyError));
    const result = await runCommand(
      UpdateIndexes,
      ["--id", "movies", "--primary-key", "id", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
