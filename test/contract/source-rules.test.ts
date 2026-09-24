/** The non-negotiable rules of CLAUDE.md that a grep can enforce. */
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../helpers/run-command.js";

async function sourceFiles(): Promise<Array<{ file: string; source: string }>> {
  const files: Array<{ file: string; source: string }> = [];
  for await (const file of glob("src/**/*.ts", { cwd: PROJECT_ROOT })) {
    if (file.includes("/generated/")) continue;
    files.push({ file, source: readFileSync(join(PROJECT_ROOT, file), "utf8") });
  }
  return files;
}

describe("source rules", () => {
  it("only src/lib/output.ts writes to stdout", async () => {
    for (const { file, source } of await sourceFiles()) {
      if (file === "src/lib/output.ts") continue;
      expect(source, `${file} writes to stdout`).not.toMatch(
        /process\.stdout\.write|console\.log\(|this\.log\(/,
      );
    }
  });

  it("only src/lib/clients/ calls fetch", async () => {
    for (const { file, source } of await sourceFiles()) {
      if (file.startsWith("src/lib/clients/")) continue;
      expect(source, `${file} calls fetch`).not.toMatch(/\bfetch\(/);
    }
  });

  it("nobody throws a bare Error", async () => {
    for (const { file, source } of await sourceFiles()) {
      expect(source, `${file} throws new Error`).not.toMatch(/throw new Error\(/);
    }
  });

  it("commands do not read process.env or build clients themselves", async () => {
    for (const { file, source } of await sourceFiles()) {
      if (!file.startsWith("src/commands/")) continue;
      expect(source, `${file} reads process.env`).not.toContain("process.env");
      expect(source, `${file} builds a client`).not.toMatch(
        /new Meilisearch\(|createEngineClient\(/,
      );
    }
  });
});
