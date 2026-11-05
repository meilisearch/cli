import { describe, expect, it } from "vitest";
import Version from "../../src/commands/version.js";
import { countRequests, useMockServer } from "../helpers/msw.js";
import { runBinary } from "../helpers/run-binary.js";
import { runCli, runCommand } from "../helpers/run-command.js";

useMockServer();

describe("meili version", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["version", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("prints the version of the CLI, the platform and the Node version as JSON, without any network call", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(Version, []);
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(0);
    expect(JSON.parse(result?.stdout ?? "")).toEqual({
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      platform: `${process.platform}-${process.arch}`,
      node: process.version,
    });
  });

  it("is what `meili --version` prints", async () => {
    const [flag, command] = await Promise.all([runBinary(["--version"]), runCommand(Version, [])]);
    expect(flag.exitCode).toBe(0);
    expect(JSON.parse(flag.stdout)).toEqual(JSON.parse(command.stdout));
  });
});
