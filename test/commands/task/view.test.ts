import { describe, expect, it } from "vitest";
import TaskView from "../../../src/commands/task/view.js";
import {
  MEILISEARCH_URL,
  makeTask,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const tasks = [makeTask({ uid: 42, status: "failed" }), makeTask({ uid: 43, status: "succeeded" })];

describe("meili task view", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["task", "view", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the task as the API returns it, with no list envelope", async () => {
    server.use(meilisearchHandlers.task(tasks));
    const result = await runCommand(TaskView, ["--id", "42", "--output", "json", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("passes the 404 of an unknown task through and exits 4", async () => {
    server.use(meilisearchHandlers.task(tasks));
    const result = await runCommand(TaskView, ["--id", "7", "--output", "json", ...project]);
    expect(result).toMatchSnapshot();
  });
});
