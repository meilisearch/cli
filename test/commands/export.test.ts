import type { TaskType } from "meilisearch";
import { describe, expect, it } from "vitest";
import Export from "../../src/commands/export.js";
import {
  MEILISEARCH_URL,
  makeEnqueuedTask,
  makeTask,
  meilisearchHandlers,
} from "../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../helpers/msw.js";
import { runCli, runCommand, tempConfig } from "../helpers/run-command.js";

useMockServer();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL };
const remote = "https://ms-1234.heaven.meilisearch.com";
/** meilisearch-js has no `export` task type yet (meilisearch/meilisearch-js#1989). */
const exportType = "export" as TaskType;
const exporting = makeEnqueuedTask({ taskUid: 7, indexUid: null, type: exportType });

/** The body the CLI sent to POST /export. */
async function bodyOf(argv: string[], runEnv: Record<string, string> = env): Promise<unknown> {
  const requests = await recordRequests(async () => {
    await runCommand(Export, argv, { env: runEnv });
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.method).toBe("POST");
  expect(requests[0]?.url.pathname).toBe("/export");
  return JSON.parse(requests[0]?.body ?? "");
}

describe("meili export", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["export", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the enqueued task as the API returned it, without waiting", async () => {
    server.use(meilisearchHandlers.export(exporting));
    const result = await runCommand(Export, ["--url", remote, "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("sends the four body fields as the JSON they spell", async () => {
    server.use(meilisearchHandlers.export(exporting));
    expect(
      await bodyOf([
        "--url",
        remote,
        "--api-key",
        "1234abcd",
        "--payload-size",
        "24MiB",
        "--indexes",
        '{"movies":{"filter":"rating > 4"}}',
      ]),
    ).toEqual({
      url: remote,
      apiKey: "1234abcd",
      payloadSize: "24MiB",
      indexes: { movies: { filter: "rating > 4" } },
    });
    expect(await bodyOf(["--url", remote, "--api-key", "null"])).toEqual({
      url: remote,
      apiKey: null,
    });
  });

  it("takes the body from --data, which a flag of the same field overrides", async () => {
    server.use(meilisearchHandlers.export(exporting));
    const data = `{"url":"${remote}","indexes":{"*":{"overrideSettings":true}}}`;
    expect(await bodyOf(["--data", data])).toEqual({
      url: remote,
      indexes: { "*": { overrideSettings: true } },
    });
    expect(await bodyOf(["--data", data, "--url", "http://localhost:7701"])).toEqual({
      url: "http://localhost:7701",
      indexes: { "*": { overrideSettings: true } },
    });
  });

  it("takes the destination from a project of the config file with --project-destination", async () => {
    server.use(meilisearchHandlers.export(exporting));
    const config = tempConfig("destination.json", {
      prod: { url: remote, apiKey: "prodkey1" },
      staging: { url: "http://localhost:7701" },
    });
    const source = ["--project-url", MEILISEARCH_URL];
    expect(await bodyOf([...source, "--project-destination", "prod"], config.env)).toEqual({
      url: remote,
      apiKey: "prodkey1",
    });
    expect(
      await bodyOf([...source, "--project-destination", "prod", "--api-key", "other"], config.env),
    ).toEqual({ url: remote, apiKey: "other" });
    expect(await bodyOf([...source, "--project-destination", "staging"], config.env)).toEqual({
      url: "http://localhost:7701",
    });
  });

  it("refuses --project-destination with --url, and a name the config file does not have", async () => {
    const config = tempConfig("refused.json", { prod: { url: remote } });
    const source = ["--project-url", MEILISEARCH_URL, "--output", "json"];
    const both = await runCommand(
      Export,
      [...source, "--project-destination", "prod", "--url", remote],
      { env: config.env },
    );
    expect(both.exitCode).toBe(2);
    expect(both.stdout).toBe("");
    const missing = await runCommand(Export, [...source, "--project-destination", "nope"], {
      env: config.env,
    });
    expect(missing.exitCode).toBe(2);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain("cli_config");
  });

  it("polls the task to its final status with --wait", async () => {
    server.use(
      meilisearchHandlers.export(exporting),
      meilisearchHandlers.taskSequence(7, [
        makeTask({ uid: 7, status: "processing", indexUid: null, type: exportType }),
        makeTask({ uid: 7, status: "succeeded", indexUid: null, type: exportType }),
      ]),
    );
    const result = await runCommand(Export, ["--url", remote, "--wait", "--output", "json"], {
      env,
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ uid: 7, status: "succeeded" });
  });

  it("passes the API error of a url that is not a string through and exits 1", async () => {
    server.use(
      meilisearchHandlers.apiError("/export", 400, {
        message: "Invalid value type at `.url`: expected a string, but found a boolean: `true`",
        code: "invalid_export_url",
        type: "invalid_request",
        link: "https://docs.meilisearch.com/errors#invalid_export_url",
      }),
    );
    const result = await runCommand(Export, ["--data", '{"url":true}', "--output", "json"], {
      env,
    });
    expect(result).toMatchSnapshot();
  });
});
