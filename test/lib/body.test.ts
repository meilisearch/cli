import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildBody, readBodyInput } from "../../src/lib/body.js";
import { caught } from "../helpers/errors.js";

vi.mock("../../src/lib/input.js", () => ({ readStdin: () => '{"fromStdin":true}' }));

const directory = mkdtempSync(join(tmpdir(), "meili-body-"));

describe("readBodyInput", () => {
  it("is nothing without --file or --data", () => {
    expect(readBodyInput({})).toBeUndefined();
  });

  it("parses --data, a file, and stdin with --file -", () => {
    const path = join(directory, "body.json");
    writeFileSync(path, '{"fromFile":1}');
    expect(readBodyInput({ data: '{"a":1}' })).toEqual({ a: 1 });
    expect(readBodyInput({ file: path })).toEqual({ fromFile: 1 });
    expect(readBodyInput({ file: "-" })).toEqual({ fromStdin: true });
  });

  it("fails with cli_input_invalid and exit 2 on invalid JSON, a non-object, or an unreadable file", () => {
    for (const flags of [
      { data: "{" },
      { data: "[1]" },
      { data: '"text"' },
      { file: join(directory, "missing.json") },
    ]) {
      const error = caught(() => readBodyInput(flags));
      expect(error.code, JSON.stringify(flags)).toBe("cli_input_invalid");
      expect(error.exitCode).toBe(2);
    }
  });
});

describe("buildBody", () => {
  it("starts from the input, then the flags given override field by field", () => {
    expect(buildBody({ name: "a", teamId: 1 }, { name: "b", resourceId: undefined })).toEqual({
      name: "b",
      teamId: 1,
    });
    expect(buildBody(undefined, { name: "a" })).toEqual({ name: "a" });
  });

  it("sends a JSON null for a flag valued null", () => {
    expect(buildBody(undefined, { expiresAt: "null" })).toEqual({ expiresAt: null });
  });
});
