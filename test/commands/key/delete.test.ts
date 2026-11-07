import { describe, expect, it } from "vitest";
import KeyDelete from "../../../src/commands/key/delete.js";
import {
  invalidApiKeyError,
  MEILISEARCH_URL,
  meilisearchHandlers,
} from "../../helpers/meilisearch-handlers.js";
import { countRequests, recordRequests, server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const project = ["--project-url", MEILISEARCH_URL];
const uid = "52787ccd-48ff-48e5-9c4b-03cd76978a60";

describe("meili key delete", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["key", "delete", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("writes nothing on stdout and exits 0, the route answering 204", async () => {
    server.use(meilisearchHandlers.keyDelete());
    const result = await runCommand(KeyDelete, ["--id", uid, "--yes", ...project]);
    expect(result).toMatchSnapshot();
  });

  it("tells a human in a terminal what it did", async () => {
    server.use(meilisearchHandlers.keyDelete());
    const result = await runCommand(KeyDelete, ["--id", uid, "--yes", ...project], { tty: true });
    expect(result).toMatchSnapshot();
  });

  it("names the key in the path", async () => {
    server.use(meilisearchHandlers.keyDelete());
    const requests = await recordRequests(async () => {
      await runCommand(KeyDelete, ["--id", uid, "--yes", ...project]);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("DELETE");
    expect(requests[0]?.url.pathname).toBe(`/keys/${uid}`);
  });

  it("refuses to run without --yes, before any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(KeyDelete, ["--id", uid, ...project]);
    });
    expect(requests).toBe(0);
    expect(result?.stdout).toBe("");
    expect(result?.exitCode).toBe(2);
    expect(JSON.parse(result?.stderr ?? "").error.code).toBe("cli_usage");
  });

  it("passes an authentication error through with a hint and exits 3", async () => {
    server.use(meilisearchHandlers.apiError(`/keys/${uid}`, 403, invalidApiKeyError));
    const result = await runCommand(KeyDelete, ["--id", uid, "--yes", ...project]);
    expect(result).toMatchSnapshot();
  });
});
