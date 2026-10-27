import { describe, expect, it } from "vitest";
import {
  iteratePages,
  mergePages,
  nextFromQuery,
  nextOffsetQuery,
  type OffsetQuery,
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

describe("nextFromQuery", () => {
  it("follows the next cursor the API answers", () => {
    expect(nextFromQuery({ limit: 2 }, { results: [5, 4], from: 5, limit: 2, next: 3 })).toEqual({
      limit: 2,
      from: 3,
    });
  });

  it("stops on the last page, which answers a null next", () => {
    expect(
      nextFromQuery({ limit: 2, from: 3 }, { results: [3], from: 3, limit: 2, next: null }),
    ).toBeUndefined();
  });
});

describe("iteratePages", () => {
  it("fetches page after page and yields each one", async () => {
    const calls: number[] = [];
    const pages: unknown[][] = [];
    for await (const page of iteratePages(
      async (query: OffsetQuery) => {
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

  it("walks a cursor route down from one uid to the next", async () => {
    const uids = [5, 4, 3, 2, 1];
    const calls: Array<number | undefined> = [];
    const pages: unknown[][] = [];
    for await (const page of iteratePages(
      async (query: { from?: number | undefined }) => {
        calls.push(query.from);
        const start = uids.indexOf(query.from ?? 5);
        const results = uids.slice(start, start + 2);
        return { results, from: results[0], limit: 2, next: uids[start + 2] ?? null };
      },
      {},
      nextFromQuery,
    )) {
      pages.push([...page.results]);
    }
    expect(calls).toEqual([undefined, 3, 1]);
    expect(pages).toEqual([[5, 4], [3, 2], [1]]);
  });
});

describe("mergePages", () => {
  it("keeps the last envelope, concatenates results and drops the fields of one page", () => {
    expect(
      mergePages([
        { results: [1, 2], offset: 0, limit: 2, total: 3 },
        { results: [3], offset: 2, limit: 2, total: 3 },
      ]),
    ).toEqual({ results: [1, 2, 3], total: 3 });

    expect(
      mergePages([
        { results: [5, 4], from: 5, limit: 2, next: 3 },
        { results: [3], from: 3, limit: 2, next: null },
      ]),
    ).toEqual({ results: [5, 4, 3], next: null });
  });
});
