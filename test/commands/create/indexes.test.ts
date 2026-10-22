import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import CreateIndexes from "../../../src/commands/create/indexes.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  makeTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };

describe("meili create indexes", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["create", "indexes", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task of the API as it is", async () => {
    server.use(meilisearchHandlers.createIndex());
    const result = await runCommand(CreateIndexes, ["--id", "movies", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("sends the uid and the primary key as the body of the route", async () => {
    const received: { body?: unknown } = {};
    server.use(meilisearchHandlers.createIndex(received));
    const result = await runCommand(
      CreateIndexes,
      ["--id", "movies", "--primary-key", "id", "--output", "json"],
      { env },
    );
    expect(result.exitCode).toBe(0);
    expect(received.body).toEqual({ uid: "movies", primaryKey: "id" });
  });

  it("takes the body from --file or --data, and lets a flag override one of its fields", async () => {
    const received: { body?: unknown } = {};
    server.use(meilisearchHandlers.createIndex(received));
    const path = join(mkdtempSync(join(tmpdir(), "meili-body-")), "index.json");
    writeFileSync(path, '{"primaryKey":"isbn"}');

    await runCommand(CreateIndexes, ["--id", "movies", "--file", path], { env });
    expect(received.body).toEqual({ uid: "movies", primaryKey: "isbn" });

    await runCommand(
      CreateIndexes,
      ["--id", "movies", "--data", '{"primaryKey":"isbn"}', "--primary-key", "id"],
      { env },
    );
    expect(received.body).toEqual({ uid: "movies", primaryKey: "id" });
  });

  it("sends a body field it declares no flag for, so the API is the one that refuses it", async () => {
    const received: { body?: unknown } = {};
    server.use(meilisearchHandlers.createIndex(received));
    await runCommand(CreateIndexes, ["--id", "movies", "--data", '{"primarykey":"id"}'], { env });
    expect(received.body).toEqual({ uid: "movies", primarykey: "id" });
  });

  it("refuses a body that is not JSON, and a file it cannot read, before any call", async () => {
    const invalidJson = await runCommand(CreateIndexes, ["--id", "movies", "--data", "{nope"], {
      env,
    });
    expect(invalidJson.exitCode).toBe(2);
    expect(invalidJson.stdout).toBe("");
    expect(JSON.parse(invalidJson.stderr).error.code).toBe("cli_input_invalid");

    const missingFile = await runCommand(
      CreateIndexes,
      ["--id", "movies", "--file", join(tmpdir(), "meili-body-does-not-exist.json")],
      { env },
    );
    expect(missingFile.exitCode).toBe(2);
    expect(JSON.parse(missingFile.stderr).error.code).toBe("cli_input_invalid");

    const scalar = await runCommand(CreateIndexes, ["--id", "movies", "--data", "42"], { env });
    expect(scalar.exitCode).toBe(2);
    expect(scalar.stdout).toBe("");
    expect(JSON.parse(scalar.stderr).error.code).toBe("cli_input_invalid");
  });

  it("prints the final task with --wait", async () => {
    server.use(
      meilisearchHandlers.createIndex(),
      meilisearchHandlers.taskSequence(11, [
        makeTask({ uid: 11, status: "processing" }),
        makeTask({ uid: 11, status: "succeeded", details: { primaryKey: "id" } }),
      ]),
    );
    const result = await runCommand(
      CreateIndexes,
      ["--id", "movies", "--wait", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("exits 7 with cli_task_failed when --wait sees the task fail, and still prints it", async () => {
    server.use(
      meilisearchHandlers.createIndex(),
      meilisearchHandlers.taskSequence(11, [
        makeTask({
          uid: 11,
          status: "failed",
          error: {
            message: "Index `movies` already exists.",
            code: "index_already_exists",
            type: "invalid_request",
            link: "https://docs.meilisearch.com/errors#index_already_exists",
          },
        }),
      ]),
    );
    const result = await runCommand(
      CreateIndexes,
      ["--id", "movies", "--wait", "--output", "json"],
      { env },
    );
    expect(result).toMatchSnapshot();
  });

  it("passes an authentication error through and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/indexes", 401, invalidApiKeyError));
    const result = await runCommand(CreateIndexes, ["--id", "movies", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
