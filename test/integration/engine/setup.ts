/**
 * The engine integration target, fixed by docs/contract/testing.md: the
 * Meilisearch started by docker-compose.yml, on localhost:7700 with the master
 * key `masterKey`. Never the MEILI_URL of the developer's shell.
 */
export const ENGINE_URL = "http://localhost:7700";
export const MASTER_KEY = "masterKey";

async function isUp(): Promise<boolean> {
  try {
    const response = await fetch(`${ENGINE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * True when Meilisearch answers. When it does not: fails loudly in CI or with
 * MEILI_INTEGRATION=required (after waiting up to 60 s for a starting container),
 * otherwise prints a notice and lets the caller skip.
 */
export async function engineAvailable(): Promise<boolean> {
  const required = process.env.CI !== undefined || process.env.MEILI_INTEGRATION === "required";
  const deadline = Date.now() + (required ? 60_000 : 0);
  for (;;) {
    if (await isUp()) return true;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const message = `Meilisearch is not reachable at ${ENGINE_URL}. Start it with \`docker compose up -d\`.`;
  if (required) throw new Error(`Integration tests are required here. ${message}`);
  console.warn(`SKIPPED: engine integration tests. ${message}`);
  return false;
}
