/**
 * Pagination for list routes: `--limit`, `--offset` and `--all`.
 * See docs/contract/output.md, section Pagination.
 */

/** What every list route of the Meilisearch API returns: `results` plus pagination fields. */
export type ListPage = { results: readonly unknown[] } & Record<string, unknown>;

export interface OffsetQuery {
  limit?: number | undefined;
  offset?: number | undefined;
}

/** The query of a route that paginates with `from`, as tasks and batches do. */
export interface FromQuery {
  limit?: number | undefined;
  from?: number | undefined;
}

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
 * The query of the page after `page` on a route that paginates with `from`:
 * the API gives the next cursor in `next`, and null at the end.
 */
export function nextFromQuery(query: FromQuery, page: ListPage): FromQuery | undefined {
  return typeof page.next === "number" ? { ...query, from: page.next } : undefined;
}

/** Fetches page after page until `advance` says the list is over. */
export async function* iteratePages<P extends ListPage, Q>(
  fetchPage: (query: Q) => Promise<P>,
  query: Q,
  advance: (query: Q, page: P) => Q | undefined,
): AsyncGenerator<P, void, undefined> {
  let current: Q | undefined = query;
  while (current !== undefined) {
    const page: P = await fetchPage(current);
    yield page;
    current = advance(current, page);
  }
}

/**
 * The envelope of the last page with `results` replaced by every item and the
 * fields that describe one page removed. Other fields, like `total`, stay.
 */
export function mergePages(pages: readonly ListPage[]): ListPage {
  const {
    limit: _limit,
    offset: _offset,
    from: _from,
    next: _next,
    ...last
  } = pages.at(-1) ?? { results: [] };
  return { ...last, results: pages.flatMap((page) => page.results) };
}
