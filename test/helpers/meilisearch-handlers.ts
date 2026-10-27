/**
 * msw handlers for the Meilisearch API. The host is fake: msw intercepts fetch before
 * any DNS lookup, and an unhandled request is an error.
 */
import type {
  EnqueuedTask,
  IndexObject,
  MeilisearchErrorResponse,
  RecordAny,
  Settings,
  Task,
} from "meilisearch";
import { HttpResponse, http } from "msw";

export const MEILISEARCH_URL = "http://meili.test:7700";

export const meilisearchHandlers = {
  /** `GET /health` answering `{ "status": "available" }`. */
  health: (url = MEILISEARCH_URL) =>
    http.get(`${url}/health`, () => HttpResponse.json({ status: "available" })),

  /** `GET /version` answering a fixed version body. */
  version: () =>
    http.get(`${MEILISEARCH_URL}/version`, () =>
      HttpResponse.json({
        commitSha: "b46889b5f0f2f8b91438a08a358ba8f05fc09fc1",
        commitDate: "2026-09-24T10:00:00.000000Z",
        pkgVersion: "1.54.0",
      }),
    ),

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

  /** `GET /indexes/{uid}/settings` answering the settings of the index. */
  settings: (settings: Settings) =>
    http.get(`${MEILISEARCH_URL}/indexes/:uid/settings`, () => HttpResponse.json(settings)),

  /** `PATCH /indexes/{uid}/settings`, the update route. */
  settingsUpdate: (task: EnqueuedTask) =>
    http.patch(`${MEILISEARCH_URL}/indexes/:uid/settings`, () => HttpResponse.json(task)),

  /** `DELETE /indexes/{uid}/settings`, which resets every setting. */
  settingsDelete: (task: EnqueuedTask) =>
    http.delete(`${MEILISEARCH_URL}/indexes/:uid/settings`, () => HttpResponse.json(task)),

  /**
   * `POST /indexes/{uid}/search` answering the envelope of the API at its
   * default pagination, with the `q` it was sent. `search` has no `--all`, and
   * the tests that pass `--limit` assert the request body, not the response.
   */
  search: (hits: RecordAny[]) =>
    http.post(`${MEILISEARCH_URL}/indexes/:uid/search`, async ({ request }) => {
      const { q } = (await request.json()) as { q?: string };
      return HttpResponse.json({
        hits,
        query: q ?? "",
        processingTimeMs: 1,
        limit: 20,
        offset: 0,
        estimatedTotalHits: hits.length,
      });
    }),

  /**
   * `POST /multi-search` answering `response`, whatever shape it is given: the
   * route answers one envelope per query, or the merged hits of every query
   * when the body carries a `federation`, and the CLI prints either as it is.
   */
  multiSearch: (response: RecordAny) =>
    http.post(`${MEILISEARCH_URL}/multi-search`, () => HttpResponse.json(response)),

  /**
   * `GET /tasks` paging over `all` like the API does: `limit` defaults to 20,
   * the newest uid first, `from` names the uid the page starts at, and the
   * envelope carries `from`, `limit`, `total` and the `next` cursor.
   */
  tasks: (all: Task[]) =>
    http.get(`${MEILISEARCH_URL}/tasks`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const limit = Number(params.get("limit") ?? 20);
      const from = params.get("from");
      const uids = params.get("uids")?.split(",");
      const matching = all
        .filter((task) => uids === undefined || uids.includes(String(task.uid)))
        .sort((a, b) => b.uid - a.uid);
      const start =
        from === null ? 0 : matching.findIndex((task) => task.uid === Number.parseInt(from, 10));
      const results = matching.slice(start, start + limit);
      return HttpResponse.json({
        results,
        total: matching.length,
        limit,
        from: results[0]?.uid ?? null,
        next: matching[start + limit]?.uid ?? null,
      });
    }),

  /** `POST /tasks/cancel`, the cancelation route. */
  tasksCancel: (task: EnqueuedTask) =>
    http.post(`${MEILISEARCH_URL}/tasks/cancel`, () => HttpResponse.json(task)),

  /** `DELETE /tasks`, the deletion route. */
  tasksDelete: (task: EnqueuedTask) =>
    http.delete(`${MEILISEARCH_URL}/tasks`, () => HttpResponse.json(task)),

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
