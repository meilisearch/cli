import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildBody } from "../../src/lib/body.js";
import { caught } from "../helpers/errors.js";

vi.mock("../../src/lib/input.js", () => ({ readStdin: () => '{"fromStdin":true}' }));

const directory = mkdtempSync(join(tmpdir(), "meili-body-"));

describe("buildBody", () => {
  it("is the flags alone without --file or --data, undefined ones left out", () => {
    expect(buildBody({}, { name: "a", teamId: undefined })).toEqual({ name: "a" });
  });

  it("starts from --data, a file, or stdin with --file -, then the flags override field by field", () => {
    const path = join(directory, "body.json");
    writeFileSync(path, '{"name":"from-file","teamId":1}');
    expect(buildBody({ data: '{"name":"a","teamId":1}' }, { name: "b" })).toEqual({
      name: "b",
      teamId: 1,
    });
    expect(buildBody({ file: path }, {})).toEqual({ name: "from-file", teamId: 1 });
    expect(buildBody({ file: "-" }, {})).toEqual({ fromStdin: true });
  });

  it("sends a JSON null for a flag valued null", () => {
    expect(buildBody({}, { expiresAt: "null" })).toEqual({ expiresAt: null });
  });

  it("fails with cli_input_invalid and exit 2 on invalid JSON, a non-object, or an unreadable file", () => {
    for (const flags of [
      { data: "{" },
      { data: "[1]" },
      { data: '"text"' },
      { file: join(directory, "missing.json") },
    ]) {
      const error = caught(() => buildBody(flags, {}));
      expect(error.code, JSON.stringify(flags)).toBe("cli_input_invalid");
      expect(error.exitCode).toBe(2);
    }
  });
});
