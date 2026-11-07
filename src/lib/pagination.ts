/**
 * Pagination for list routes: `--limit`, `--offset` and `--all`.
 * See docs/contract/output.md, section Pagination.
 */

/** What every list route of either API returns: `results` plus pagination fields. */
export type ListPage = { results: readonly unknown[] } & Record<string, unknown>;

export interface OffsetQuery {
  limit?: number | undefined;
  offset?: number | undefined;
}

/** The envelope fields that describe one page rather than the whole list. */
const PAGE_FIELDS = ["limit", "offset"];

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

/** The query of a route that pages by number: the Management API's. */
export interface PageQuery {
  page?: number | undefined;
}

/** The query of the page after `page` on a numbered route, or undefined past `totalPages`. */
export function nextPageQuery<Q extends PageQuery>(query: Q, page: ListPage): Q | undefined {
  const current = numberField(page, "page");
  const done = page.results.length === 0 || current >= numberField(page, "totalPages");
  return done ? undefined : { ...query, page: current + 1 };
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
 * fields that describe one page removed. The others, like `total`, stay.
 */
export function mergePages(pages: readonly ListPage[]): ListPage {
  const last = { ...(pages.at(-1) ?? { results: [] }) };
  for (const field of PAGE_FIELDS) delete last[field];
  return { ...last, results: pages.flatMap((page) => page.results) };
}
