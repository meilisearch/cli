import { describe, expect, it } from "vitest";
import { MeiliCliError } from "../../src/lib/errors.js";
import {
  formatData,
  resolveOutputMode,
  resolveOutputModeFromArgv,
  useColor,
} from "../../src/lib/output.js";

describe("resolveOutputMode", () => {
  const base = { flag: undefined, json: false, env: {}, stdoutIsTTY: false };

  it("defaults to json when stdout is not a TTY and table when it is", () => {
    expect(resolveOutputMode(base)).toBe("json");
    expect(resolveOutputMode({ ...base, stdoutIsTTY: true })).toBe("table");
  });

  it("lets --output win over everything", () => {
    expect(
      resolveOutputMode({
        flag: "table",
        json: false,
        env: { MEILI_OUTPUT: "ndjson" },
        stdoutIsTTY: false,
      }),
    ).toBe("table");
  });

  it("treats --json as --output json", () => {
    expect(resolveOutputMode({ ...base, json: true, stdoutIsTTY: true })).toBe("json");
  });

  it("reads MEILI_OUTPUT before the TTY rule", () => {
    expect(resolveOutputMode({ ...base, env: { MEILI_OUTPUT: "ndjson" } })).toBe("ndjson");
    expect(resolveOutputMode({ ...base, env: { MEILI_OUTPUT: "table" } })).toBe("table");
  });

  it("rejects an invalid MEILI_OUTPUT with cli_usage", () => {
    expect(() => resolveOutputMode({ ...base, env: { MEILI_OUTPUT: "yaml" } })).toThrow(
      MeiliCliError,
    );
    expect(resolveOutputMode({ ...base, env: { MEILI_OUTPUT: "yaml" }, lenient: true })).toBe(
      "json",
    );
  });

  it("scans a raw argv for the fatal error handler", () => {
    expect(resolveOutputModeFromArgv(["helth", "--output", "table"], {}, false)).toBe("table");
    expect(resolveOutputModeFromArgv(["helth", "-o", "ndjson"], {}, false)).toBe("ndjson");
    expect(resolveOutputModeFromArgv(["helth", "--output=table"], {}, false)).toBe("table");
    expect(resolveOutputModeFromArgv(["helth", "--json"], {}, true)).toBe("json");
    expect(resolveOutputModeFromArgv(["helth"], {}, true)).toBe("table");
  });
});

describe("useColor", () => {
  it("needs a TTY, no --no-color and no NO_COLOR", () => {
    expect(useColor({ streamIsTTY: true, noColorFlag: false, env: {} })).toBe(true);
    expect(useColor({ streamIsTTY: false, noColorFlag: false, env: {} })).toBe(false);
    expect(useColor({ streamIsTTY: true, noColorFlag: true, env: {} })).toBe(false);
    expect(useColor({ streamIsTTY: true, noColorFlag: false, env: { NO_COLOR: "1" } })).toBe(false);
  });
});

describe("formatData", () => {
  const value = { status: "available", nested: { a: 1 }, list: [1, 2] };

  it("prints compact JSON off a TTY and indented JSON on a TTY", () => {
    expect(formatData(value, { mode: "json", stdoutIsTTY: false, color: false })).toBe(
      `${JSON.stringify(value)}\n`,
    );
    expect(formatData(value, { mode: "json", stdoutIsTTY: true, color: false })).toBe(
      `${JSON.stringify(value, null, 2)}\n`,
    );
  });

  it("keeps the field order of the API", () => {
    const ordered = { z: 1, a: 2, m: 3 };
    expect(formatData(ordered, { mode: "json", stdoutIsTTY: false, color: false })).toBe(
      '{"z":1,"a":2,"m":3}\n',
    );
  });

  it("refuses ndjson unless the command supports it", () => {
    expect(() => formatData(value, { mode: "ndjson", stdoutIsTTY: false, color: false })).toThrow(
      MeiliCliError,
    );
    expect(
      formatData([{ a: 1 }, { b: 2 }], {
        mode: "ndjson",
        stdoutIsTTY: false,
        supportsNdjson: true,
        color: false,
      }),
    ).toBe('{"a":1}\n{"b":2}\n');
  });

  it("renders an object as key/value rows in table mode", () => {
    expect(formatData(value, { mode: "table", stdoutIsTTY: true, color: false })).toBe(
      'status  available\nnested  {"a":1}\nlist    [1,2]\n',
    );
  });

  it("renders a list of objects as a table with a header", () => {
    const rows = [
      { uid: "movies", primaryKey: "id" },
      { uid: "books", primaryKey: null, extra: true },
    ];
    expect(formatData(rows, { mode: "table", stdoutIsTTY: true, color: false })).toBe(
      "UID     PRIMARYKEY  EXTRA\nmovies  id\nbooks   null        true\n",
    );
  });

  it("bolds the header only with color", () => {
    const out = formatData([{ a: 1 }], { mode: "table", stdoutIsTTY: true, color: true });
    expect(out.startsWith(`${String.fromCodePoint(0x1b)}[1mA`)).toBe(true);
  });

  it("prints nothing for an empty list and the bare value for a primitive", () => {
    expect(formatData([], { mode: "table", stdoutIsTTY: true, color: false })).toBe("");
    expect(formatData("ok", { mode: "table", stdoutIsTTY: true, color: false })).toBe("ok\n");
  });
});
