/**
 * msw handlers for the Meilisearch API. The host is fake: msw intercepts fetch before
 * any DNS lookup, and an unhandled request is an error.
 */
import type {
  EnqueuedTask,
  IndexObject,
  MeilisearchErrorResponse,
  RecordAny,
  Task,
} from "meilisearch";
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

  /** `POST /indexes`, the creation route. */
  indexCreate: (task: EnqueuedTask) =>
    http.post(`${MEILISEARCH_URL}/indexes`, () => HttpResponse.json(task)),

  /** `PATCH /indexes/{uid}`, the update route. */
  indexUpdate: (task: EnqueuedTask) =>
    http.patch(`${MEILISEARCH_URL}/indexes/:uid`, () => HttpResponse.json(task)),

  /** `DELETE /indexes/{uid}`, the deletion route. */
  indexDelete: (task: EnqueuedTask) =>
    http.delete(`${MEILISEARCH_URL}/indexes/:uid`, () => HttpResponse.json(task)),

  /**
   * `POST /indexes/{uid}/documents/fetch` paginating over `all` like the API
   * does: `limit` defaults to 20, `offset` to 0, and `ids` narrows the list.
   */
  documentsFetch: (all: RecordAny[]) =>
    http.post(`${MEILISEARCH_URL}/indexes/:uid/documents/fetch`, async ({ request }) => {
      const query = (await request.json()) as { limit?: number; offset?: number; ids?: string[] };
      const matching =
        query.ids === undefined
          ? all
          : all.filter((document) => query.ids?.includes(String(document.id)));
      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;
      return HttpResponse.json({
        results: matching.slice(offset, offset + limit),
        offset,
        limit,
        total: matching.length,
      });
    }),

  /** `POST /indexes/{uid}/documents`, the addition route. */
  documentsAdd: (task: EnqueuedTask) =>
    http.post(`${MEILISEARCH_URL}/indexes/:uid/documents`, () => HttpResponse.json(task)),

  /** `PUT /indexes/{uid}/documents`, the update route. */
  documentsUpdate: (task: EnqueuedTask) =>
    http.put(`${MEILISEARCH_URL}/indexes/:uid/documents`, () => HttpResponse.json(task)),

  /** `DELETE /indexes/{uid}/documents`, which deletes every document. */
  documentsDeleteAll: (task: EnqueuedTask) =>
    http.delete(`${MEILISEARCH_URL}/indexes/:uid/documents`, () => HttpResponse.json(task)),

  /** `POST /indexes/{uid}/documents/delete`, the deletion by filter. */
  documentsDeleteByFilter: (task: EnqueuedTask) =>
    http.post(`${MEILISEARCH_URL}/indexes/:uid/documents/delete`, () => HttpResponse.json(task)),

  /** `POST /indexes/{uid}/documents/delete-batch`, the deletion by identifiers. */
  documentsDeleteBatch: (task: EnqueuedTask) =>
    http.post(`${MEILISEARCH_URL}/indexes/:uid/documents/delete-batch`, () =>
      HttpResponse.json(task),
    ),

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
function indexNotFoundError(uid: string): MeilisearchErrorResponse {
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

/** The task body a write route answers with, before anything has run. */
export function makeEnqueuedTask(overrides: Partial<EnqueuedTask> = {}): EnqueuedTask {
  return {
    taskUid: 42,
    indexUid: "movies",
    status: "enqueued",
    type: "documentAdditionOrUpdate",
    enqueuedAt: "2026-09-24T10:00:00Z",
    ...overrides,
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
