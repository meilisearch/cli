/** docs/contract/config.md against the code: every MEILI_* variable, both ways. */
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BaseCommand } from "../../src/lib/base-command.js";
import { ENV_VARS } from "../../src/lib/config.js";
import { PROJECT_ROOT } from "../helpers/run-command.js";
import { codeSpans, readDoc, section, tableRows } from "./markdown.js";

const documented = tableRows(
  section(readDoc("docs/contract/config.md"), "Environment variables"),
).map((row) => codeSpans(row[0] ?? "")[0] ?? "");

describe("environment variables", () => {
  it("config.ts declares exactly the variables of config.md, in the same order", () => {
    expect(ENV_VARS.map((variable) => variable.name)).toEqual(documented);
  });

  it("every MEILI_* literal in src/ is documented", async () => {
    const seen = new Set<string>();
    for await (const file of glob("src/**/*.ts", { cwd: PROJECT_ROOT })) {
      if (file.includes("/generated/")) continue;
      const source = readFileSync(join(PROJECT_ROOT, file), "utf8");
      for (const match of source.matchAll(/\bMEILI_[A-Z_]+\b/g)) seen.add(match[0]);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const name of seen) expect(documented, `${name} is not in config.md`).toContain(name);
  });

  it("every documented MEILI_* variable is read by config.ts", () => {
    const source = readFileSync(join(PROJECT_ROOT, "src/lib/config.ts"), "utf8");
    for (const name of documented) expect(source, `${name} is never read`).toContain(`"${name}"`);
  });
});

describe("flags and environment variables share their name (CLAUDE.md, rule 14)", () => {
  const groups = [
    BaseCommand.baseFlags,
    BaseCommand.waitFlags,
    BaseCommand.paginationFlags,
    BaseCommand.bodyInputFlags,
    BaseCommand.confirmFlags,
  ];
  const flagNames = new Set(groups.flatMap((group) => Object.keys(group)));
  const envNames = new Set(ENV_VARS.map((variable) => variable.name));
  const variableFor = (flag: string): string => `MEILI_${flag.toUpperCase().replaceAll("-", "_")}`;

  it("a variable that doubles a flag is MEILI_ plus the flag name in upper snake case", () => {
    const linked = ENV_VARS.filter((variable) => variable.flag !== undefined);
    expect(linked.length).toBeGreaterThan(0);
    for (const variable of linked) {
      const flag = variable.flag ?? "";
      expect(variable.name, `${variable.name} must be named after --${flag}`).toBe(
        variableFor(flag),
      );
      expect(flagNames, `--${flag} does not exist on BaseCommand`).toContain(flag);
    }
  });

  it("no flag has a look-alike variable that is not linked to it", () => {
    for (const flag of flagNames) {
      const expected = variableFor(flag);
      if (!envNames.has(expected)) continue;
      const variable = ENV_VARS.find((candidate) => candidate.name === expected);
      expect(variable?.flag, `${expected} must declare flag "${flag}"`).toBe(flag);
    }
  });
});
