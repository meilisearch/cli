import { describe, expect, it } from "vitest";
import { formatData } from "../../src/lib/output.js";

describe("formatData", () => {
  const value = { status: "available", nested: { a: 1 }, list: [1, 2] };

  it("prints compact JSON off a TTY and indented JSON on a TTY", () => {
    expect(formatData(value, false)).toBe(`${JSON.stringify(value)}\n`);
    expect(formatData(value, true)).toBe(`${JSON.stringify(value, null, 2)}\n`);
  });

  it("keeps the field order of the API", () => {
    expect(formatData({ z: 1, a: 2, m: 3 }, false)).toBe('{"z":1,"a":2,"m":3}\n');
  });
});
