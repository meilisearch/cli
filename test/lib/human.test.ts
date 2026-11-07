import { afterEach, describe, expect, it } from "vitest";
import { defaultView } from "../../src/lib/human.js";
import { setOutputMode } from "../../src/lib/output.js";

describe("defaultView", () => {
  afterEach(() => setOutputMode({ json: false, color: false }, false));
  setOutputMode({ json: false, color: false }, true);

  it("prints a list envelope as a table, with its pagination on the status line", () => {
    const view = defaultView({
      results: [
        { uid: "movies", primaryKey: "id", createdAt: "2026-10-14T10:00:00Z" },
        { uid: "books", primaryKey: null, createdAt: "2026-10-14T10:00:00Z" },
      ],
      offset: 0,
      limit: 20,
      total: 2,
    });
    expect(view).toMatchSnapshot();
  });

  it("shows at most 6 simple attributes, and says the view is simplified", () => {
    const view = defaultView({
      hits: [{ id: 1, a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, _formatted: { a: 1 } }],
      query: "",
      processingTimeMs: 1,
      estimatedTotalHits: 1,
      facetDistribution: { genre: { drama: 1 } },
    });
    expect(view).toMatchSnapshot();
  });

  it("prints an array of objects as a table, and an empty list as its count", () => {
    expect(defaultView([{ id: 1, name: "Search", organizationId: 1 }])).toMatchSnapshot();
    expect(defaultView({ results: [], total: 0 })).toEqual({ status: ["Showing 0 of 0"] });
  });

  it("prints every attribute of an object, nested ones indented", () => {
    expect(
      defaultView({ uid: "movies", status: "available", settings: { rankingRules: ["words"] } }),
    ).toMatchSnapshot();
  });
});
