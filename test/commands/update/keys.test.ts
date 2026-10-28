import { describe, expect, it } from "vitest";
import UpdateKeys from "../../../src/commands/update/keys.js";
import {
  apiKeyNotFoundError,
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeKey,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const uid = "52787ccd-48ff-48e5-9c4b-03cd76978a60";
const updated = makeKey({ uid, name: "CI indexer", description: null });

/** The body the command sent to `PATCH /keys/{key}`. */
async function sentBody(argv: string[]): Promise<unknown> {
  server.use(meilisearchHandlers.keyUpdate(updated));
  const requests = await recordRequests(async () => {
    await runCommand(UpdateKeys, argv, { env });
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.method).toBe("PATCH");
  expect(requests[0]?.url.pathname).toBe(`/keys/${uid}`);
  return JSON.parse(requests[0]?.body ?? "");
}

describe("meili update keys", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["update", "keys", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the key the API returned, as it returned it", async () => {
    server.use(meilisearchHandlers.keyUpdate(updated));
    const result = await runCommand(
      UpdateKeys,
      ["--id", uid, "--name", "CI indexer", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("sends the two fields the route takes", async () => {
    expect(
      await sentBody(["--id", uid, "--name", "CI indexer", "--description", "Nightly"]),
    ).toEqual({ name: "CI indexer", description: "Nightly" });
  });

  it("sends a JSON null for the value null, which removes the field", async () => {
    expect(await sentBody(["--id", uid, "--description", "null"])).toEqual({ description: null });
  });

  it("passes the 404 of an unknown key through and exits 4", async () => {
    server.use(meilisearchHandlers.apiError("/keys/nope", 404, apiKeyNotFoundError));
    const result = await runCommand(
      UpdateKeys,
      ["--id", "nope", "--name", "CI indexer", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError(`/keys/${uid}`, 403, invalidApiKeyError));
    const result = await runCommand(
      UpdateKeys,
      ["--id", uid, "--name", "CI indexer", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
