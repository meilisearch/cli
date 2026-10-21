/**
 * The `--debug` trace: every HTTP request and response of the process on
 * stderr, secrets redacted (docs/contract/config.md, "Secrets"). It belongs to
 * no client in particular, since `meili auth login` traces calls it makes
 * without building one.
 */
import { redactBody, redactHeaders } from "../config.js";

type Write = (line: string) => void;

let traceInstalled = false;

/**
 * Wraps the global fetch for the rest of the process and writes a redacted
 * trace of every request and response on stderr.
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
    traceRequest(write, input, init);
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

function traceRequest(
  write: Write,
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
): void {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  write(`> ${method.toUpperCase()} ${url}\n`);
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  writeHeaders(write, "> ", headers);
  const body = init?.body;
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
