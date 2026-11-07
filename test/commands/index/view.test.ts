import { describe, expect, it } from "vitest";
import IndexView from "../../../src/commands/index/view.js";
import {
  MEILISEARCH_URL,
  makeIndex,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const three = [makeIndex("movies", "id"), makeIndex("books", "isbn"), makeIndex("songs")];

describe("meili index view", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["index", "view", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("gets one index with --id, as the API returns it", async () => {
    server.use(meilisearchHandlers.index(three));
    const result = await runCommand(IndexView, ["--id", "books", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("prints a summary, then every attribute, for a human in a terminal", async () => {
    server.use(meilisearchHandlers.index(three));
    const result = await runCommand(IndexView, ["--id", "books", ...project], { tty: true });
    expect(result).toMatchSnapshot();
  });

  it("passes the 404 of an unknown --id through and exits 4", async () => {
    server.use(meilisearchHandlers.index(three));
    const result = await runCommand(IndexView, ["--id", "nope", ...project]);
    expect(result).toMatchSnapshot();
  });
});
