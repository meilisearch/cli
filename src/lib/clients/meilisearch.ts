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

/**
 * `GET /keys`, the list route of `get keys`. `getKeys` of meilisearch-js
 * rewrites `createdAt` and `updatedAt` into `Date` objects, which JSON writes
 * back with milliseconds where the API answered nanoseconds: the agent would
 * read a value the API never sent, against the pass-through of
 * docs/contract/output.md. ADR 0003 allows `client.httpRequest` until the SDK
 * leaves the body alone, as `fetchStats` does. The other four routes of the
 * resource return the body as it comes, so they call the SDK.
 */
export function fetchKeys(
  client: Meilisearch,
  query: { limit?: number | undefined; offset?: number | undefined },
): Promise<ListPage> {
  return client.httpRequest.get({ path: "keys", params: query });
}
