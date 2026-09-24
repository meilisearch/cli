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

  it("describes every command of the manifest, offline and without credentials", async () => {
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
    const schema = JSON.parse(result?.stdout ?? "") as { commands: Array<{ id: string }> };
    expect(schema.commands.map((command) => command.id).sort()).toEqual(
      Object.keys(manifest.commands)
        .map((id) => id.replaceAll(":", " "))
        .sort(),
    );
  });
});
