import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MeiliCliError } from "../../src/lib/errors.js";
import { readBodyArrayInput, readBodyInput } from "../../src/lib/input.js";

function tempFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "meili-input-")), "body.json");
  writeFileSync(path, content);
  return path;
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof MeiliCliError ? error.code : `not a MeiliCliError: ${String(error)}`;
  }
  return "no error";
}

describe("readBodyInput", () => {
  it("is undefined when neither --file nor --data is given", () => {
    expect(readBodyInput({})).toBeUndefined();
  });

  it("parses --data and the content of --file", () => {
    expect(readBodyInput({ data: '{"primaryKey":"id"}' })).toEqual({ primaryKey: "id" });
    expect(readBodyInput({ file: tempFile('[{"id":1}]') })).toEqual([{ id: 1 }]);
  });

  it("prefers --data, which oclif already refuses next to --file", () => {
    expect(readBodyInput({ data: '{"from":"data"}', file: tempFile('{"from":"file"}') })).toEqual({
      from: "data",
    });
  });

  it("is cli_input_invalid on text that is not JSON and on a file it cannot read", () => {
    expect(codeOf(() => readBodyInput({ data: "{nope" }))).toBe("cli_input_invalid");
    expect(codeOf(() => readBodyInput({ file: join(tmpdir(), "meili-absent.json") }))).toBe(
      "cli_input_invalid",
    );
  });
});

describe("readBodyArrayInput", () => {
  it("returns the array of --file or --data", () => {
    expect(readBodyArrayInput({ data: '[{"id":1},{"id":2}]' })).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("is cli_usage without a body: the route has nothing to send", () => {
    expect(codeOf(() => readBodyArrayInput({}))).toBe("cli_usage");
  });

  it("is cli_input_invalid when the body is not an array", () => {
    expect(codeOf(() => readBodyArrayInput({ data: '{"id":1}' }))).toBe("cli_input_invalid");
  });
});
