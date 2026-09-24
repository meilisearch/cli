/** Every ADR has a status line, and a superseded ADR names an existing successor. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../helpers/run-command.js";

const adrDir = join(PROJECT_ROOT, "docs/adr");
const files = readdirSync(adrDir).filter((file) => /^\d{4}-.*\.md$/.test(file));

describe("docs/adr", () => {
  it("has at least the founding decisions", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files)("%s has a status line and a valid successor", (file) => {
    const text = readFileSync(join(adrDir, file), "utf8");
    const status = text.match(/^Status: (accepted|superseded by ADR (\d{4}))\./m);
    expect(
      status,
      `${file} needs "Status: accepted." or "Status: superseded by ADR NNNN."`,
    ).not.toBeNull();
    const successor = status?.[2];
    if (successor !== undefined) {
      expect(
        files.some((other) => other.startsWith(`${successor}-`)),
        `ADR ${successor} does not exist`,
      ).toBe(true);
    }
  });
});
