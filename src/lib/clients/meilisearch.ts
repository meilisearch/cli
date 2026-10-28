/** Builds the meilisearch-js client from a resolved project connection. */
import { type DocumentsQuery, Meilisearch } from "meilisearch";
import type { ListPage } from "../pagination.js";

export interface MeilisearchClientOptions {
  url: string;
  apiKey: string | undefined;
  /** CLI version, sent in the X-Meilisearch-Client header. */
  version: string;
}

export function createMeilisearchClient(options: MeilisearchClientOptions): Meilisearch {
  return new Meilisearch({
    host: options.url,
    apiKey: options.apiKey,
    clientAgents: [`meili-cli (v${options.version})`],
  });
}

/**
 * `POST /indexes/{index}/documents/fetch`, the one route `get documents`
 * covers. `getDocuments` of meilisearch-js takes it only when the query carries
 * a filter and falls back to the GET twin otherwise, which the CLI does not
 * implement (docs/contract/commands.md, exceptions).
 */
export function fetchDocuments(
  client: Meilisearch,
  index: string,
  query: DocumentsQuery,
): Promise<ListPage> {
  return client.httpRequest.post({ path: `indexes/${index}/documents/fetch`, body: query });
}

/**
 * `GET /stats` and `GET /indexes/{index}/stats` with the query parameters of
 * the routes. `getStats` of meilisearch-js sends none, so it cannot carry
 * `showInternalDatabaseSizes` or `sizeFormat`: ADR 0003 allows
 * `client.httpRequest` until the SDK takes them. The body is returned as it
 * comes, untyped, because `sizeFormat=human` answers strings where the types
 * of the SDK declare numbers.
 */
export function fetchStats(
  client: Meilisearch,
  index: string | undefined,
  query: { showInternalDatabaseSizes?: boolean; sizeFormat?: "human" | "raw" },
): Promise<unknown> {
  return client.httpRequest.get({
    path: index === undefined ? "stats" : `indexes/${index}/stats`,
    params: query,
  });
}
