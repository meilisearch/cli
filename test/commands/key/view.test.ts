import { describe, expect, it } from "vitest";
import KeyView from "../../../src/commands/key/view.js";
import {
  MEILISEARCH_URL,
  makeKey,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const search = makeKey({ uid: "52787ccd-48ff-48e5-9c4b-03cd76978a60" });
const admin = makeKey({
  uid: "89208a34-d4e0-4e00-80e0-f21039c312b8",
  name: "Default Admin API Key",
  description: "Use it for anything that is not a search operation",
  key: "5dad55f9b953543783f152231fae2213ecc10c218498369b50e6925b1163c657",
  actions: ["*"],
});
const both = [search, admin];

describe("meili key view", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["key", "view", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("gets one key by its uid, as the API returns it", async () => {
    server.use(meilisearchHandlers.key(both));
    const result = await runCommand(KeyView, ["--id", search.uid, "--output", "json", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("gets one key by its key value, which the route takes too", async () => {
    server.use(meilisearchHandlers.key(both));
    const requests = await recordRequests(async () => {
      await runCommand(KeyView, ["--id", admin.key, ...project]);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe(`/keys/${admin.key}`);
  });

  it("passes the 404 of an unknown key through and exits 4", async () => {
    server.use(meilisearchHandlers.key(both));
    const result = await runCommand(KeyView, ["--id", "nope", "--output", "json", ...project]);
    expect(result).toMatchSnapshot();
  });
});
