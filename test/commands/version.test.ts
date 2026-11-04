import { describe, expect, it } from "vitest";
import Version from "../../src/commands/version.js";
import { countRequests, useMockServer } from "../helpers/msw.js";
import { runCli, runCommand } from "../helpers/run-command.js";

useMockServer();

describe("meili version", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["version", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the version of the CLI as JSON, without any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(Version, ["--output", "json"]);
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(0);
    expect(JSON.parse(result?.stdout ?? "")).toEqual({
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
    });
  });

  it("rejects ndjson, which is for lists", async () => {
    const result = await runCommand(Version, ["--output", "ndjson"]);
    expect(result).toMatchSnapshot();
  });
});
