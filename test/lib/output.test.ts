import { describe, expect, it } from "vitest";
import { MeiliCliError } from "../../src/lib/errors.js";
import { formatData, resolveOutputMode } from "../../src/lib/output.js";

describe("resolveOutputMode", () => {
  it("defaults to json", () => {
    expect(resolveOutputMode({ flag: undefined, env: {} })).toBe("json");
  });

  it("lets --output win over MEILI_OUTPUT", () => {
    expect(resolveOutputMode({ flag: "json", env: { MEILI_OUTPUT: "ndjson" } })).toBe("json");
    expect(resolveOutputMode({ flag: "ndjson", env: {} })).toBe("ndjson");
  });

  it("reads MEILI_OUTPUT before the default", () => {
    expect(resolveOutputMode({ flag: undefined, env: { MEILI_OUTPUT: "ndjson" } })).toBe("ndjson");
    expect(resolveOutputMode({ flag: undefined, env: { MEILI_OUTPUT: "" } })).toBe("json");
  });

  it("rejects an invalid MEILI_OUTPUT with cli_usage", () => {
    expect(() => resolveOutputMode({ flag: undefined, env: { MEILI_OUTPUT: "table" } })).toThrow(
      MeiliCliError,
    );
  });
});

describe("formatData", () => {
  const value = { status: "available", nested: { a: 1 }, list: [1, 2] };

  it("prints compact JSON off a TTY and indented JSON on a TTY", () => {
    expect(formatData(value, { mode: "json", stdoutIsTTY: false })).toBe(
      `${JSON.stringify(value)}\n`,
    );
    expect(formatData(value, { mode: "json", stdoutIsTTY: true })).toBe(
      `${JSON.stringify(value, null, 2)}\n`,
    );
  });

  it("keeps the field order of the API", () => {
    expect(formatData({ z: 1, a: 2, m: 3 }, { mode: "json", stdoutIsTTY: false })).toBe(
      '{"z":1,"a":2,"m":3}\n',
    );
  });

  it("refuses ndjson unless the command supports it", () => {
    expect(() => formatData(value, { mode: "ndjson", stdoutIsTTY: false })).toThrow(MeiliCliError);
    expect(
      formatData([{ a: 1 }, { b: 2 }], {
        mode: "ndjson",
        stdoutIsTTY: false,
        supportsNdjson: true,
      }),
    ).toBe('{"a":1}\n{"b":2}\n');
  });
});
