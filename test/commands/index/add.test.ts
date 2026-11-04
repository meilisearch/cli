import { describe, expect, it } from "vitest";
import IndexAdd from "../../../src/commands/index/add.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeEnqueuedTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const created = makeEnqueuedTask({ taskUid: 11, type: "indexCreation" });

/** The body the command sent to `POST /indexes`. */
async function sentBody(argv: string[]): Promise<unknown> {
  server.use(meilisearchHandlers.indexCreate(created));
  const requests = await recordRequests(async () => {
    await runCommand(IndexAdd, [...argv, ...project]);
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.method).toBe("POST");
  expect(requests[0]?.url.pathname).toBe("/indexes");
  return JSON.parse(requests[0]?.body ?? "");
}

describe("meili index add", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["index", "add", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.indexCreate(created));
    const result = await runCommand(IndexAdd, ["--id", "movies", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("sends the index and its primary key in the body", async () => {
    expect(await sentBody(["--id", "movies", "--primary-key", "id"])).toEqual({
      uid: "movies",
      primaryKey: "id",
    });
  });

  it("sends the index alone when no flag gives a primary key", async () => {
    expect(await sentBody(["--id", "movies"])).toEqual({ uid: "movies" });
  });

  it("accepts --uid, the API spelling of --id", async () => {
    expect(await sentBody(["--uid", "movies"])).toEqual({ uid: "movies" });
  });

  it("sends the fields of --data, and lets --primary-key override the one it carries", async () => {
    const body = await sentBody([
      "--id",
      "movies",
      "--data",
      '{"primaryKey":"isbn","primarykey":"typo"}',
      "--primary-key",
      "id",
    ]);
    expect(body).toEqual({ uid: "movies", primaryKey: "id", primarykey: "typo" });
  });

  it("refuses a body that is not a JSON object, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(IndexAdd, ["--id", "movies", "--data", "42", ...project]);
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_input_invalid");
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/indexes", 403, invalidApiKeyError));
    const result = await runCommand(IndexAdd, ["--id", "movies", ...project]);
    expect(result).toMatchSnapshot();
  });
});
