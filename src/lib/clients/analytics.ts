/**
 * Sends usage events to PostHog, through the proxy that Meilisearch Cloud uses
 * too (ADR 0016). A failure is never an error: the result of a command does
 * not depend on its analytics.
 */

export const ANALYTICS_URL = "https://t.meilisearch.com";

/** The PostHog project of Meilisearch Cloud. A project key can only write events: it is not a secret. */
const PROJECT_KEY = "phc_D5VtJkw6WyBzLtZ5tBvwR7ac4LvQZdFGYQTQfegRjh9n";

const TIMEOUT_MS = 1000;

export interface AnalyticsEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

/** One request for every event, ignored when it fails or takes longer than a second. */
export async function sendEvents(events: AnalyticsEvent[]): Promise<void> {
  try {
    await fetch(`${ANALYTICS_URL}/batch/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: PROJECT_KEY, batch: events }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Offline, blocked or slow: the command already has its result.
  }
}
