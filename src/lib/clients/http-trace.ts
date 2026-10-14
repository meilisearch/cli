/** The `--debug` trace: every request and response on stderr, secrets redacted. */
import { redactBody, redactHeaders } from "../config.js";

type Write = (line: string) => void;

let traceInstalled = false;

/**
 * Wraps the global fetch for the rest of the process and writes a redacted
 * trace of every request and response on stderr. Both clients go through fetch.
 *
 * meilisearch-js offers an `httpClient` option, but it replaces the response
 * parsing and error mapping of the SDK, so tracing there would change the
 * behavior of the CLI in debug mode. Wrapping fetch keeps the SDK untouched.
 */
export function installHttpTrace(write: Write = (line) => process.stderr.write(line)): void {
  if (traceInstalled) return;
  traceInstalled = true;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    await traceRequest(write, input, init);
    const started = performance.now();
    let response: Response;
    try {
      response = await original(input, init);
    } catch (error) {
      write(`< network error: ${error instanceof Error ? error.message : String(error)}\n`);
      throw error;
    }
    const elapsed = Math.round(performance.now() - started);
    write(`< HTTP ${response.status} ${response.statusText} (${elapsed} ms)\n`);
    writeHeaders(write, "< ", response.headers);
    writeBody(write, "< ", await response.clone().text());
    return response;
  };
}

/**
 * meilisearch-js calls `fetch(url, init)`; the generated Management API client
 * builds a `Request` and calls `fetch(request)`. Both shapes are traced.
 */
async function traceRequest(
  write: Write,
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
): Promise<void> {
  const request = input instanceof Request ? input : undefined;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? request?.method ?? "GET";
  write(`> ${method.toUpperCase()} ${url}\n`);
  writeHeaders(write, "> ", new Headers(init?.headers ?? request?.headers));
  const body = init?.body ?? (await request?.clone().text());
  if (typeof body === "string") writeBody(write, "> ", body);
  else if (body !== undefined && body !== null) write("> [body not shown: not text]\n");
}

function writeHeaders(write: Write, prefix: string, headers: Headers): void {
  for (const [name, value] of Object.entries(redactHeaders(headers))) {
    write(`${prefix}${name}: ${value}\n`);
  }
}

function writeBody(write: Write, prefix: string, text: string): void {
  if (text === "") return;
  let rendered: string;
  try {
    rendered = JSON.stringify(redactBody(JSON.parse(text)));
  } catch {
    rendered = "[body not shown: not JSON]";
  }
  write(`${prefix}${rendered}\n`);
}
