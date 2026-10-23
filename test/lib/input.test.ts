/**
 * `--file` and `--data`, the shared body input of docs/contract/output.md.
 * Reading stdin is mocked at `node:fs`, where `readStdin` reads descriptor 0.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MeiliCliError } from "../../src/lib/errors.js";
import { isJsonObject, readJsonBody } from "../../src/lib/input.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (path: unknown, encoding: unknown) =>
      path === 0 ? '{"from":"stdin"}\n' : actual.readFileSync(path as string, encoding as "utf8"),
  };
});

const directory = mkdtempSync(join(tmpdir(), "meili-input-"));
const file = join(directory, "body.json");
writeFileSync(file, '{"from":"file"}');
const broken = join(directory, "broken.json");
writeFileSync(broken, "{nope}");

describe("readJsonBody", () => {
  it("returns undefined when neither --file nor --data is given", () => {
    expect(readJsonBody({})).toBeUndefined();
  });

  it("parses --data", () => {
    expect(readJsonBody({ data: '[{"id":1}]' })).toEqual([{ id: 1 }]);
  });

  it("parses the file of --file", () => {
    expect(readJsonBody({ file })).toEqual({ from: "file" });
  });

  it("reads stdin with --file -", () => {
    expect(readJsonBody({ file: "-" })).toEqual({ from: "stdin" });
  });

  it("rejects text that is not JSON with cli_input_invalid", () => {
    expect(() => readJsonBody({ data: "{nope}" })).toThrow(
      expect.objectContaining({ code: "cli_input_invalid" }) as MeiliCliError,
    );
    expect(() => readJsonBody({ file: broken })).toThrow(
      expect.objectContaining({ code: "cli_input_invalid" }) as MeiliCliError,
    );
  });

  it("rejects a file it cannot read with cli_input_invalid", () => {
    expect(() => readJsonBody({ file: join(directory, "absent.json") })).toThrow(
      expect.objectContaining({ code: "cli_input_invalid" }) as MeiliCliError,
    );
  });
});

describe("isJsonObject", () => {
  it("accepts an object and nothing else", () => {
    expect(isJsonObject({ filter: "a = b" })).toBe(true);
    expect(isJsonObject([1, 2])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject("a")).toBe(false);
  });
});
