/**
 * The shared group of the `delete` commands, proved on a command that spreads
 * it: no command of that verb exists yet, and the rule is the contract
 * (docs/contract/output.md, "Destructive commands", ADR 0007).
 */
import { describe, expect, it } from "vitest";
import { BaseCommand } from "../../src/lib/base-command.js";
import { runCommand } from "../helpers/run-command.js";

class DeleteThings extends BaseCommand {
  static override flags = { ...BaseCommand.confirmFlags };

  async run(): Promise<void> {}
}

describe("BaseCommand.confirmFlags", () => {
  it("refuses to run without --yes, with cli_usage and exit 2", async () => {
    const result = await runCommand(DeleteThings, []);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    const { error } = JSON.parse(result.stderr) as { error: { code: string; message: string } };
    expect(error.code).toBe("cli_usage");
    expect(error.message).toContain("Missing required flag yes");
  });

  it("runs with --yes", async () => {
    const result = await runCommand(DeleteThings, ["--yes"]);
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });
});
