/**
 * The latency of a Meilisearch Cloud region, measured as the dashboard does:
 * three `HEAD https://ping.<regionUrl>` in a row, and their median. No OpenAPI
 * document describes these hosts: they only answer, and the answer is not read.
 */

/** How long one ping may take before the region counts as unreachable. */
const PING_TIMEOUT_MS = 3000;

/** The median of three pings in milliseconds, or undefined when the region does not answer. */
export async function regionLatency(regionUrl: string): Promise<number | undefined> {
  const pings: number[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      await fetch(`https://ping.${regionUrl}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      pings.push(performance.now() - start);
    }
  } catch {
    return undefined;
  }
  return Math.round(pings.sort((a, b) => a - b)[1] as number);
}
