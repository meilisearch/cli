import { describe, expect, it } from "vitest";
import AddKeys from "../../../src/commands/add/keys.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeKey,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const created = makeKey({
  uid: "52787ccd-48ff-48e5-9c4b-03cd76978a60",
  name: "CI indexer",
  description: null,
  actions: ["documents.add"],
  indexes: ["movies"],
});

/** The body the command sent to `POST /keys`. */
async function sentBody(argv: string[]): Promise<unknown> {
  server.use(meilisearchHandlers.keyCreate(created));
  const requests = await recordRequests(async () => {
    await runCommand(AddKeys, argv, { env });
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.method).toBe("POST");
  expect(requests[0]?.url.pathname).toBe("/keys");
  return JSON.parse(requests[0]?.body ?? "");
}

describe("meili add keys", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["add", "keys", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the key the API created, its key value included", async () => {
    server.use(meilisearchHandlers.keyCreate(created));
    const result = await runCommand(
      AddKeys,
      [
        "--actions",
        "documents.add",
        "--indexes",
        "movies",
        "--expires-at",
        "null",
        "--output",
        "json",
      ],
      { env },
    );
    expect(result).toMatchSnapshot();
    expect(result.stdout).toContain(created.key);
  });

  it("sends the actions and the indexes as arrays, and null as a JSON null", async () => {
    expect(
      await sentBody([
        "--actions",
        "search,documents.add",
        "--indexes",
        "movies,*",
        "--expires-at",
        "null",
      ]),
    ).toEqual({
      actions: ["search", "documents.add"],
      indexes: ["movies", "*"],
      expiresAt: null,
    });
  });

  it("sends the uid of --id, the name and the description", async () => {
    expect(
      await sentBody([
        "--id",
        created.uid,
        "--actions",
        "search",
        "--indexes",
        "movies",
        "--expires-at",
        "2027-01-01T00:00:00Z",
        "--name",
        "CI indexer",
        "--description",
        "Indexes the catalog nightly",
      ]),
    ).toEqual({
      uid: created.uid,
      actions: ["search"],
      indexes: ["movies"],
      expiresAt: "2027-01-01T00:00:00Z",
      name: "CI indexer",
      description: "Indexes the catalog nightly",
    });
  });

  it("accepts --uid, the API spelling of --id", async () => {
    const body = await sentBody(["--uid", created.uid, "--actions", "search", "--indexes", "*"]);
    expect(body).toMatchObject({ uid: created.uid });
  });

  it("sends the fields of --data, and lets a flag override the one it carries", async () => {
    expect(
      await sentBody([
        "--data",
        '{"actions":["*"],"indexes":["*"],"expiresAt":null}',
        "--actions",
        "search",
      ]),
    ).toEqual({ actions: ["search"], indexes: ["*"], expiresAt: null });
  });

  it("refuses a body that is not a JSON object, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(AddKeys, ["--data", "[1,2]"], { env });
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_input_invalid");
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/keys", 403, invalidApiKeyError));
    const result = await runCommand(
      AddKeys,
      ["--actions", "search", "--indexes", "*", "--expires-at", "null", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });
});
