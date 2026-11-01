import { describe, expect, it } from "vitest";
import GetKeys from "../../../src/commands/get/keys.js";
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
const search = makeKey({ uid: "52787ccd-48ff-48e5-9c4b-03cd76978a60" });
const admin = makeKey({
  uid: "89208a34-d4e0-4e00-80e0-f21039c312b8",
  name: "Default Admin API Key",
  description: "Use it for anything that is not a search operation",
  key: "5dad55f9b953543783f152231fae2213ecc10c218498369b50e6925b1163c657",
  actions: ["*"],
});
const both = [search, admin];

describe("meili get keys", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["get", "keys", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the API envelope as it is, the key of every key included", async () => {
    server.use(meilisearchHandlers.keys(both));
    const result = await runCommand(GetKeys, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
    expect(result.stdout).toContain(search.key);
  });

  it("gets one key by its uid through the unit route", async () => {
    server.use(meilisearchHandlers.key(both));
    const result = await runCommand(GetKeys, ["--id", search.uid, "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("gets one key by its key value, which the route takes too", async () => {
    server.use(meilisearchHandlers.key(both));
    const requests = await recordRequests(async () => {
      await runCommand(GetKeys, ["--id", admin.key], { env });
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe(`/keys/${admin.key}`);
  });

  it("ignores the pagination flags when --id selects the unit route", async () => {
    server.use(meilisearchHandlers.key(both));
    const requests = await recordRequests(async () => {
      await runCommand(GetKeys, ["--id", search.uid, "--limit", "5"], { env });
    });
    expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({});
  });

  it("follows the pagination with --all and merges every page into one envelope", async () => {
    server.use(meilisearchHandlers.keys(both));
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(GetKeys, ["--all", "--limit", "1", "--output", "json"], { env });
    });
    expect(requests).toBe(2);
    expect(JSON.parse(result?.stdout ?? "")).toEqual({ results: both, total: 2 });
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError("/keys", 403, invalidApiKeyError));
    const result = await runCommand(GetKeys, ["--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });

  it("passes the 404 of an unknown key through and exits 4", async () => {
    server.use(meilisearchHandlers.key(both));
    const result = await runCommand(GetKeys, ["--id", "nope", "--output", "json"], { env });
    expect(result).toMatchSnapshot();
  });
});
