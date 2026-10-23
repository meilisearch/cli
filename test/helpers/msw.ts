import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

/** One msw server per test file. Unhandled requests fail the request, so nothing real goes out. */
export const server = setupServer();

export function useMockServer(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}

export interface RecordedRequest {
  method: string;
  url: URL;
  body: string;
}

/** Records the HTTP requests msw sees while `fn` runs, bodies included. */
export async function recordRequests(fn: () => Promise<unknown>): Promise<RecordedRequest[]> {
  const pending: Array<Promise<RecordedRequest>> = [];
  const onRequest = ({ request }: { request: Request }): void => {
    const clone = request.clone();
    pending.push(
      clone.text().then((body) => ({ method: clone.method, url: new URL(clone.url), body })),
    );
  };
  server.events.on("request:start", onRequest);
  try {
    await fn();
  } finally {
    server.events.removeListener("request:start", onRequest);
  }
  return Promise.all(pending);
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
