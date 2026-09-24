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

/** Fetches page after page until the end. */
export async function* iteratePages<P extends ListPage>(
  fetchPage: (query: OffsetQuery) => Promise<P>,
  query: OffsetQuery,
): AsyncGenerator<P, void, undefined> {
  let current: OffsetQuery | undefined = query;
  while (current !== undefined) {
    const page: P = await fetchPage(current);
    yield page;
    current = nextOffsetQuery(current, page);
  }
}

/**
 * The envelope of the last page with `results` replaced by every item and
 * `limit` and `offset` removed. Other fields, like `total`, stay.
 */
export function mergePages(pages: readonly ListPage[]): ListPage {
  const { limit: _limit, offset: _offset, ...last } = pages.at(-1) ?? { results: [] };
  return { ...last, results: pages.flatMap((page) => page.results) };
}
