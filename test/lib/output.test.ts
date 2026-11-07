import { describe, expect, it } from "vitest";
import { formatData } from "../../src/lib/output.js";

describe("formatData", () => {
  const value = { status: "available", nested: { a: 1 }, list: [1, 2] };

  it("prints compact JSON", () => {
    expect(formatData(value)).toBe(`${JSON.stringify(value)}\n`);
  });

  it("keeps the field order of the API", () => {
    expect(formatData({ z: 1, a: 2, m: 3 })).toBe('{"z":1,"a":2,"m":3}\n');
  });
});
