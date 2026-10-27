/**
 * Pagination for list routes: `--limit` with `--offset`, `--from` or `--page`,
 * and `--all`. See docs/contract/output.md, section Pagination.
 */

/** What every list route of either API returns: `results` plus pagination fields. */
export type ListPage = { results: readonly unknown[] } & Record<string, unknown>;

export interface OffsetQuery {
  limit?: number | undefined;
  offset?: number | undefined;
}

/** The query of a route that pages with a cursor: tasks and batches. */
export interface FromQuery {
  limit?: number | undefined;
  from?: number | undefined;
}

/** The query of a route that pages by page number: the Management API lists. */
export interface PageQuery {
  limit?: number | undefined;
  page?: number | undefined;
}

/** The envelope fields that describe one page rather than the whole list. */
const PAGE_FIELDS = ["limit", "offset", "from", "page", "totalPages"];

function numberField(page: ListPage, name: string): number {
  const value = page[name];
  return typeof value === "number" ? value : 0;
}

/** The query of the page after `page`, or undefined once `total` is reached. */
export function nextOffsetQuery(query: OffsetQuery, page: ListPage): OffsetQuery | undefined {
  const offset = numberField(page, "offset") + page.results.length;
  const done = page.results.length === 0 || offset >= numberField(page, "total");
  return done ? undefined : { ...query, offset };
}

/**
 * The query of the page after `page` on a cursor route: the API answers the
 * `from` of the next page in `next`, and a `next` that is not a number, null
 * on the last page, ends the walk.
 */
export function nextFromQuery(query: FromQuery, page: ListPage): FromQuery | undefined {
  const next = page.next;
  return typeof next === "number" ? { ...query, from: next } : undefined;
}

/**
 * The query of the page after `page` on a route that numbers its pages: the
 * API answers which page it served and how many there are.
 */
export function nextPageQuery(query: PageQuery, page: ListPage): PageQuery | undefined {
  const current = numberField(page, "page");
  return current >= numberField(page, "totalPages") ? undefined : { ...query, page: current + 1 };
}

/** Fetches page after page until `nextQuery` says there is no page left. */
export async function* iteratePages<Q, P extends ListPage>(
  fetchPage: (query: Q) => Promise<P>,
  query: Q,
  nextQuery: (query: Q, page: ListPage) => Q | undefined,
): AsyncGenerator<P, void, undefined> {
  let current: Q | undefined = query;
  while (current !== undefined) {
    const page: P = await fetchPage(current);
    yield page;
    current = nextQuery(current, page);
  }
}

/**
 * The envelope of the last page with `results` replaced by every item and the
 * fields that describe one page removed. The others, like `total`, stay. A
 * route carries one group or another, so dropping them all drops its own.
 */
export function mergePages(pages: readonly ListPage[]): ListPage {
  const last = { ...(pages.at(-1) ?? { results: [] }) };
  for (const field of PAGE_FIELDS) delete last[field];
  return { ...last, results: pages.flatMap((page) => page.results) };
}
