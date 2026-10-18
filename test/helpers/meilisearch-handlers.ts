/**
 * msw handlers for the Meilisearch API. The host is fake: msw intercepts fetch before
 * any DNS lookup, and an unhandled request is an error.
 */
import type { IndexObject, MeilisearchErrorResponse, Task } from "meilisearch";
import { HttpResponse, http } from "msw";

export const MEILISEARCH_URL = "http://meili.test:7700";

export const meilisearchHandlers = {
  /** `GET /health` answering `{ "status": "available" }`. */
  health: (url = MEILISEARCH_URL) =>
    http.get(`${url}/health`, () => HttpResponse.json({ status: "available" })),

  /**
   * `GET /indexes` paginating over `all` like the API does: `limit` defaults to
   * 20, `offset` to 0, and the envelope carries `offset`, `limit` and `total`.
   */
  indexes: (all: IndexObject[]) =>
    http.get(`${MEILISEARCH_URL}/indexes`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const limit = Number(params.get("limit") ?? 20);
      const offset = Number(params.get("offset") ?? 0);
      return HttpResponse.json({
        results: all.slice(offset, offset + limit),
        offset,
        limit,
        total: all.length,
      });
    }),

  /** `GET /indexes/{uid}` answering the index from `all`, or the 404 body of Meilisearch. */
  index: (all: IndexObject[]) =>
    http.get(`${MEILISEARCH_URL}/indexes/:uid`, ({ params }) => {
      const found = all.find((index) => index.uid === params.uid);
      return found === undefined
        ? HttpResponse.json(indexNotFoundError(String(params.uid)), { status: 404 })
        : HttpResponse.json(found);
    }),

  /**
   * `POST /indexes` answering the enqueued task of Meilisearch, with the index
   * of the body. `received` keeps the body the command sent, so a test can
   * assert what travelled over the wire.
   */
  createIndex: (received: { body?: unknown } = {}) =>
    http.post(`${MEILISEARCH_URL}/indexes`, async ({ request }) => {
      const body = (await request.json()) as { uid: string };
      received.body = body;
      return HttpResponse.json(
        {
          taskUid: 11,
          indexUid: body.uid,
          status: "enqueued",
          type: "indexCreation",
          enqueuedAt: "2026-09-24T10:00:00Z",
        },
        { status: 202 },
      );
    }),

  /**
   * `POST /indexes/{uid}/search` answering `hits` in the envelope of the API,
   * and recording the body the command sent.
   */
  search: (hits: Array<Record<string, unknown>>, received: { body?: unknown } = {}) =>
    http.post(`${MEILISEARCH_URL}/indexes/:uid/search`, async ({ request }) => {
      const body = (await request.json()) as { q?: string; limit?: number; offset?: number };
      received.body = body;
      return HttpResponse.json({
        hits,
        query: body.q ?? "",
        processingTimeMs: 1,
        limit: body.limit ?? 20,
        offset: body.offset ?? 0,
        estimatedTotalHits: hits.length,
      });
    }),

  /**
   * `GET /tasks` paginating over `all` the way the API does: `from` is the uid
   * of the first task of the page, `next` the one of the page after it, null
   * at the end. `received` keeps the query string the command sent.
   */
  tasks: (all: Task[], received: { query?: Record<string, string> } = {}) =>
    http.get(`${MEILISEARCH_URL}/tasks`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      received.query = Object.fromEntries(params);
      const limit = Number(params.get("limit") ?? 20);
      const from = params.get("from");
      const start = from === null ? 0 : all.findIndex((task) => task.uid === Number(from));
      const results = all.slice(start, start + limit);
      const after = all[start + limit];
      return HttpResponse.json({
        results,
        total: all.length,
        limit,
        from: results[0]?.uid ?? null,
        next: after?.uid ?? null,
      });
    }),

  /**
   * `POST /indexes/{uid}/documents/fetch`, the POST that lists: it paginates
   * over `all` with the `offset` and `limit` of its body, and keeps only the
   * documents of `ids` when the body carries some. `received` keeps the body.
   */
  fetchDocuments: (all: Array<Record<string, unknown>>, received: { body?: unknown } = {}) =>
    http.post(`${MEILISEARCH_URL}/indexes/:uid/documents/fetch`, async ({ request }) => {
      const body = (await request.json()) as {
        offset?: number;
        limit?: number;
        ids?: Array<string | number>;
      };
      received.body = body;
      const selected =
        body.ids === undefined
          ? all
          : all.filter((document) => body.ids?.map(String).includes(String(document.id)));
      const offset = body.offset ?? 0;
      const limit = body.limit ?? 20;
      return HttpResponse.json({
        results: selected.slice(offset, offset + limit),
        offset,
        limit,
        total: selected.length,
      });
    }),

  /** Any method on `path` answering a Meilisearch error body with `status`. */
  apiError: (path: string, status: number, body: MeilisearchErrorResponse) =>
    http.all(`${MEILISEARCH_URL}${path}`, () => HttpResponse.json(body, { status })),

  /** Any method on `path` failing at the network level. */
  networkError: (path: string) => http.all(`${MEILISEARCH_URL}${path}`, () => HttpResponse.error()),

  /** `GET /tasks/{uid}` answering the given tasks in order, then the last one forever. */
  taskSequence: (uid: number, tasks: Task[]) => {
    let index = 0;
    return http.get(`${MEILISEARCH_URL}/tasks/${uid}`, () => {
      const task = tasks[Math.min(index, tasks.length - 1)];
      index += 1;
      return HttpResponse.json(task);
    });
  },
};

/** The error body Meilisearch returns for a wrong or missing API key. */
export const invalidApiKeyError: MeilisearchErrorResponse = {
  message: "The provided API key is invalid.",
  code: "invalid_api_key",
  type: "auth",
  link: "https://docs.meilisearch.com/errors#invalid_api_key",
};

/** The error body Meilisearch returns for an index that does not exist. */
export function indexNotFoundError(uid: string): MeilisearchErrorResponse {
  return {
    message: `Index \`${uid}\` not found.`,
    code: "index_not_found",
    type: "invalid_request",
    link: "https://docs.meilisearch.com/errors#index_not_found",
  };
}

export function makeIndex(uid: string, primaryKey?: string): IndexObject {
  return {
    uid,
    ...(primaryKey === undefined ? {} : { primaryKey }),
    createdAt: "2026-09-24T10:00:00.000000Z",
    updatedAt: "2026-09-24T10:00:00.000000Z",
  };
}

export function makeTask(overrides: Partial<Task> & Pick<Task, "uid" | "status">): Task {
  return {
    indexUid: "movies",
    type: "indexCreation",
    enqueuedAt: "2026-09-24T10:00:00Z",
    startedAt: null,
    finishedAt: null,
    duration: null,
    batchUid: null,
    canceledBy: null,
    details: undefined,
    error: undefined,
    ...overrides,
  } as Task;
}
