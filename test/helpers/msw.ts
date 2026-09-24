import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

/** One msw server per test file. Unhandled requests fail the request, so nothing real goes out. */
export const server = setupServer();

export function useMockServer(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}

/** Counts the HTTP requests msw sees while `fn` runs. */
export async function countRequests(fn: () => Promise<unknown>): Promise<number> {
  let count = 0;
  const onRequest = (): void => {
    count += 1;
  };
  server.events.on("request:start", onRequest);
  try {
    await fn();
  } finally {
    server.events.removeListener("request:start", onRequest);
  }
  return count;
}
