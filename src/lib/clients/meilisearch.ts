/**
 * Builds the meilisearch-js client from a resolved project connection.
 * The only place, with the Management API client, that touches HTTP.
 */
import { Meilisearch } from "meilisearch";

export interface MeilisearchClientOptions {
  url: string;
  apiKey: string | undefined;
  /** `meili-cli (v1.2.3)`, sent in the X-Meilisearch-Client header. */
  userAgent: string;
}

export function createMeilisearchClient(options: MeilisearchClientOptions): Meilisearch {
  return new Meilisearch({
    host: options.url,
    apiKey: options.apiKey,
    clientAgents: [options.userAgent],
  });
}
