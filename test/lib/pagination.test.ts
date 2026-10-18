import { describe, expect, it } from "vitest";
import {
  iteratePages,
  mergePages,
  nextFromQuery,
  nextOffsetQuery,
} from "../../src/lib/pagination.js";

describe("nextOffsetQuery", () => {
  it("advances by the number of results until the total is reached", () => {
    expect(
      nextOffsetQuery({ limit: 2 }, { results: [1, 2], offset: 0, limit: 2, total: 5 }),
    ).toEqual({
      limit: 2,
      offset: 2,
    });
    expect(
      nextOffsetQuery({ limit: 2, offset: 4 }, { results: [5], offset: 4, limit: 2, total: 5 }),
    ).toBeUndefined();
  });

  it("stops on an empty page", () => {
    expect(nextOffsetQuery({}, { results: [], offset: 0, limit: 20, total: 0 })).toBeUndefined();
  });
});

describe("iteratePages", () => {
  it("fetches page after page and yields each one", async () => {
    const calls: number[] = [];
    const pages: unknown[][] = [];
    for await (const page of iteratePages(
      async (query: { offset?: number }) => {
        const offset = query.offset ?? 0;
        calls.push(offset);
        return { results: [1, 2, 3, 4, 5].slice(offset, offset + 2), offset, limit: 2, total: 5 };
      },
      {},
      nextOffsetQuery,
    )) {
      pages.push([...page.results]);
    }
    expect(calls).toEqual([0, 2, 4]);
    expect(pages).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("nextFromQuery", () => {
  it("follows the next cursor of the API until it is null", () => {
    expect(
      nextFromQuery({ limit: 2 }, { results: [1, 2], total: 5, limit: 2, from: 9, next: 7 }),
    ).toEqual({ limit: 2, from: 7 });
    expect(
      nextFromQuery(
        { limit: 2, from: 7 },
        { results: [1], total: 5, limit: 2, from: 7, next: null },
      ),
    ).toBeUndefined();
  });
});

describe("mergePages", () => {
  it("keeps the last envelope, concatenates results and drops limit and offset", () => {
    expect(
      mergePages([
        { results: [1, 2], offset: 0, limit: 2, total: 3 },
        { results: [3], offset: 2, limit: 2, total: 3 },
      ]),
    ).toEqual({ results: [1, 2, 3], total: 3 });
  });
});
