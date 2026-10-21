/** Builds the meilisearch-js client from a resolved project connection. */
import { Meilisearch } from "meilisearch";

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
