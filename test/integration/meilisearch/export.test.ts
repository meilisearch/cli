/**
 * Every call here names an index pattern that matches no index of the
 * instance: the route then answers a task that succeeds at once, without
 * opening a connection to `--url`. An export that does carry an index holds
 * the task queue of this Meilisearch for as long as the transfer lasts, which
 * the other suites of this directory share, and it needs a second instance to
 * send the data to, which `docker-compose.yml` does not start.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runBinary } from "../../helpers/run-binary.js";
import { MASTER_KEY, MEILISEARCH_URL, meilisearchAvailable } from "./setup.js";

const meilisearchUp = await meilisearchAvailable();

const env = { MEILI_PROJECT_URL: MEILISEARCH_URL, MEILI_PROJECT_API_KEY: MASTER_KEY };
/** Nothing listens there, and with no index to send nothing is sent. */
const remote = "http://127.0.0.1:1";
const absent = `meili-cli-test-export-${randomUUID().slice(0, 8)}`;

describe.skipIf(!meilisearchUp)("meili export against a real Meilisearch", () => {
  it("answers the enqueued task of the export, without waiting", async () => {
    const result = await runBinary(
      [
        "export",
        "--url",
        remote,
        "--indexes",
        JSON.stringify({ [absent]: {} }),
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const task = JSON.parse(result.stdout) as { taskUid: number };
    expect(task).toMatchObject({ indexUid: null, type: "export", status: "enqueued" });
    expect(typeof task.taskUid).toBe("number");
  });

  it("waits for the task with --wait and prints the body it sent in its details", async () => {
    const result = await runBinary(
      [
        "export",
        "--url",
        remote,
        "--api-key",
        "1234abcd",
        "--payload-size",
        "24MiB",
        "--indexes",
        JSON.stringify({ [absent]: {} }),
        "--wait",
        "--output",
        "json",
      ],
      env,
    );
    expect(result.exitCode).toBe(0);
    const task = JSON.parse(result.stdout) as { details: { indexes: Record<string, unknown> } };
    expect(task).toMatchObject({ type: "export", status: "succeeded" });
    expect(task.details).toMatchObject({ url: remote, payloadSize: "24 MiB" });
    // The route answers the indexes the patterns matched, none here, which is why the task is already over.
    expect(task.details.indexes).toEqual({});
  });

  it("passes the error of a url that is not a string through and exits 1", async () => {
    const result = await runBinary(["export", "--data", '{"url":true}', "--output", "json"], env);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("invalid_export_url");
  });
});
