import { describe, expect, it } from "vitest";
import BatchView from "../../../src/commands/batch/view.js";
import {
  MEILISEARCH_URL,
  makeBatch,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const batches = [makeBatch({ uid: 7 }), makeBatch({ uid: 8 })];

describe("meili batch view", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["batch", "view", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the batch as the API returns it, with no list envelope", async () => {
    server.use(meilisearchHandlers.batch(batches));
    const result = await runCommand(BatchView, ["--id", "7", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("passes the 404 of an unknown batch through and exits 4", async () => {
    server.use(meilisearchHandlers.batch(batches));
    const result = await runCommand(BatchView, ["--id", "99", ...project]);
    expect(result).toMatchSnapshot();
  });
});
