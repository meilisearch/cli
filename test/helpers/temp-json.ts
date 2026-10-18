import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Writes `value` as JSON in a fresh temporary directory and returns its path, for `--file`. */
export function writeTempJson(value: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), "meili-test-")), "body.json");
  writeFileSync(path, JSON.stringify(value));
  return path;
}
