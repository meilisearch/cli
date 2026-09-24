/** docs/contract/config.md against the code: every MEILI_* variable, both ways. */
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
