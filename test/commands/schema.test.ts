import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Schema from "../../src/commands/schema.js";
import { countRequests, useMockServer } from "../helpers/msw.js";
import { PROJECT_ROOT, runCli, runCommand } from "../helpers/run-command.js";

useMockServer();

const manifestIds = Object.keys(
  (
    JSON.parse(readFileSync(join(PROJECT_ROOT, "oclif.manifest.json"), "utf8")) as {
      commands: Record<string, unknown>;
    }
  ).commands,
).map((id) => id.replaceAll(":", " "));

describe("meili schema", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["schema", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("indexes every command of the manifest, with the global flags once, offline", async () => {
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(Schema, ["--output", "json"]);
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(0);
    expect(result?.stderr).toBe("");
    const schema = JSON.parse(result?.stdout ?? "") as {
      globalFlags: Array<{ name: string }>;
      commands: Array<{ id: string; flags?: unknown }>;
    };
    expect(schema.commands.map((command) => command.id).sort()).toEqual([...manifestIds].sort());
    expect(schema.globalFlags.map((flag) => flag.name)).toEqual([
      "project-url",
      "project-api-key",
      "project",
      "output",
      "debug",
    ]);
    expect(
      schema.commands.every((command) => command.flags === undefined),
      "the index carries no flag: that is what --command is for",
    ).toBe(true);
  });

  it("prints one command in full with --command, without repeating the global flags", async () => {
    const result = await runCommand(Schema, ["--command", "get indexes", "--output", "json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchSnapshot();
  });

  it("keeps the global flags a command redefines, with its own description", async () => {
    const result = await runCommand(Schema, ["--command", "config add", "--output", "json"]);
    expect(result.exitCode).toBe(0);
    const command = JSON.parse(result.stdout) as {
      flags: Array<{ name: string; required: boolean; description: string }>;
    };
    expect(command.flags.find((flag) => flag.name === "project")).toEqual({
      name: "project",
      type: "option",
      required: true,
      description: "Name of the project to add.",
      helpValue: "<name>",
    });
    expect(
      command.flags.some((flag) => flag.name === "debug"),
      "a global flag the command leaves untouched stays in the index only",
    ).toBe(false);
  });

  it("refuses an unknown command with cli_usage and exit 2", async () => {
    const result = await runCommand(Schema, ["--command", "get stats", "--output", "json"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchSnapshot();
  });
});
