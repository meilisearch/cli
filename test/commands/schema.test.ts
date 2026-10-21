import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Schema from "../../src/commands/schema.js";
import { countRequests, useMockServer } from "../helpers/msw.js";
import { PROJECT_ROOT, runCli, runCommand } from "../helpers/run-command.js";

useMockServer();

describe("meili schema", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["schema", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("indexes every command of the manifest, without their flags, offline", async () => {
    const manifest = JSON.parse(
      readFileSync(join(PROJECT_ROOT, "oclif.manifest.json"), "utf8"),
    ) as { commands: Record<string, unknown> };
    let result: Awaited<ReturnType<typeof runCommand>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCommand(Schema, ["--output", "json"]);
    });
    expect(requests).toBe(0);
    expect(result?.exitCode).toBe(0);
    expect(result?.stderr).toBe("");
    const schema = JSON.parse(result?.stdout ?? "") as {
      commands: Array<{ id: string; description: string; flags?: unknown }>;
    };
    expect(schema.commands.map((command) => command.id).sort()).toEqual(
      Object.keys(manifest.commands)
        .map((id) => id.replaceAll(":", " "))
        .sort(),
    );
    expect(
      schema.commands.every((command) => command.flags === undefined),
      "the index carries no flag: that is what --command is for",
    ).toBe(true);
    expect(
      schema.commands.every((command) => !command.description.includes("\n")),
      "the index carries the first paragraph of a description, not the warning that follows",
    ).toBe(true);
  });

  it("prints the flags a command declares itself, not the global ones it inherits", async () => {
    const result = await runCommand(Schema, ["--command", "config add", "--output", "json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const command = JSON.parse(result.stdout) as {
      description: string;
      flags: Array<{ name: string }>;
    };
    // `config add` declares the three values it writes, with its own descriptions.
    expect(command.flags).toEqual([
      {
        name: "project",
        type: "option",
        required: true,
        description: "Name of the project to add.",
        helpValue: "<name>",
      },
      {
        name: "project-url",
        type: "option",
        required: true,
        description: "URL of the project.",
        helpValue: "<url>",
      },
      {
        name: "project-api-key",
        type: "option",
        description: "API key of the project. `-` reads it from stdin, out of the shell history.",
        helpValue: "<key>",
      },
    ]);
    expect(command.description).toContain("\n\n");
  });

  it("refuses an unknown command with cli_usage and exit 2", async () => {
    const result = await runCommand(Schema, ["--command", "get indexs", "--output", "json"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchSnapshot();
  });
});
