/**
 * msw handlers for the Meilisearch API. The host is fake: msw intercepts fetch before
 * any DNS lookup, and an unhandled request is an error.
 */
import type {
  Batch,
  EnqueuedTask,
  IndexObject,
  Key,
  MeilisearchErrorResponse,
  RecordAny,
  Settings,
  Task,
} from "meilisearch";
import { HttpResponse, http } from "msw";

export const MEILISEARCH_URL = "http://meili.test:7700";

/**
 * One page of a route that pages with a cursor, `GET /tasks` and `GET /batches`:
 * `limit` defaults to 20, the newest uid first, `from` names the uid the page
 * starts at, `idsParam` narrows the list, and the envelope carries `from`,
 * `limit`, `total` and the `next` cursor.
 */
function cursorPage<T extends { uid: number }>(all: T[], url: string, idsParam: string) {
  const params = new URL(url).searchParams;
  const limit = Number(params.get("limit") ?? 20);
  const from = params.get("from");
  const uids = params.get(idsParam)?.split(",");
  const matching = all
    .filter((item) => uids === undefined || uids.includes(String(item.uid)))
    .sort((a, b) => b.uid - a.uid);
  const start =
    from === null ? 0 : matching.findIndex((item) => item.uid === Number.parseInt(from, 10));
  const results = matching.slice(start, start + limit);
  return {
    results,
    total: matching.length,
    limit,
    from: results[0]?.uid ?? null,
    next: matching[start + limit]?.uid ?? null,
  };
}

/**
 * One page of a route that pages with an offset, `GET /indexes` and `GET /keys`:
 * `limit` defaults to 20, `offset` to 0, and the envelope carries `offset`,
 * `limit` and `total`.
 */
function offsetPage<T>(all: T[], url: string) {
  const params = new URL(url).searchParams;
  const limit = Number(params.get("limit") ?? 20);
  const offset = Number(params.get("offset") ?? 0);
  return { results: all.slice(offset, offset + limit), offset, limit, total: all.length };
}

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

  /** `GET /indexes`, paginating over `all` with the offset of the route. */
  indexes: (all: IndexObject[]) =>
    http.get(`${MEILISEARCH_URL}/indexes`, ({ request }) =>
      HttpResponse.json(offsetPage(all, request.url)),
    ),

  /** `GET /indexes/{uid}` answering the index from `all`, or the 404 body of Meilisearch. */
  index: (all: IndexObject[]) => unitRoute("/indexes/:id", "index", all, (index) => index.uid),

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
   * does: `limit` defaults to 20, `offset` to 0, `ids` narrows the list, and `fields` the attributes.
   */
  documentsFetch: (all: RecordAny[]) =>
    http.post(`${MEILISEARCH_URL}/indexes/:uid/documents/fetch`, async ({ request }) => {
      const query = (await request.json()) as {
        limit?: number;
        offset?: number;
        ids?: string[];
        fields?: string[];
      };
      const matching =
        query.ids === undefined
          ? all
          : all.filter((document) => query.ids?.includes(String(document.id)));
      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;
      const { fields } = query;
      return HttpResponse.json({
        results: matching
          .slice(offset, offset + limit)
          .map((document) =>
            fields === undefined
              ? document
              : Object.fromEntries(
                  Object.entries(document).filter(([key]) => fields.includes(key)),
                ),
          ),
        offset,
        limit,
        total: matching.length,
      });
    }),

  /** `GET /indexes/{uid}/documents/{id}` answering the document from `all`, or the 404 body of Meilisearch. */
  document: (all: RecordAny[]) =>
    unitRoute("/indexes/:uid/documents/:id", "document", all, (document) => document.id),

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
   * `POST /indexes/{uid}/similar` answering the envelope of the API at its
   * default pagination, with the `id` of the document it was sent.
   */
  similar: (hits: RecordAny[]) =>
    http.post(`${MEILISEARCH_URL}/indexes/:uid/similar`, async ({ request }) => {
      const { id } = (await request.json()) as { id?: string };
      return HttpResponse.json({
        hits,
        id: id ?? "",
        processingTimeMs: 1,
        limit: 20,
        offset: 0,
        estimatedTotalHits: hits.length,
      });
    }),

  /**
   * `POST /indexes/{uid}/facet-search` answering the facet values it is given,
   * with the `facetQuery` it was sent, `null` when the body carried none.
   */
  facetSearch: (facetHits: Array<{ value: string; count: number }>) =>
    http.post(`${MEILISEARCH_URL}/indexes/:uid/facet-search`, async ({ request }) => {
      const { facetQuery } = (await request.json()) as { facetQuery?: string };
      return HttpResponse.json({ facetHits, facetQuery: facetQuery ?? null, processingTimeMs: 0 });
    }),

  /**
   * `POST /multi-search` answering `response`, whatever shape it is given: the
   * route answers one envelope per query, or the merged hits of every query
   * when the body carries a `federation`, and the CLI prints either as it is.
   */
  multiSearch: (response: RecordAny) =>
    http.post(`${MEILISEARCH_URL}/multi-search`, () => HttpResponse.json(response)),

  /** `GET /stats`, the statistics of every index of the instance. */
  stats: (stats: RecordAny) => http.get(`${MEILISEARCH_URL}/stats`, () => HttpResponse.json(stats)),

  /** `GET /indexes/{uid}/stats`, the statistics of one index. */
  indexStats: (stats: RecordAny) =>
    http.get(`${MEILISEARCH_URL}/indexes/:uid/stats`, () => HttpResponse.json(stats)),

  /** `GET /tasks`, paging over `all` with the cursor of the route, narrowed by `uids`. */
  tasks: (all: Task[]) =>
    http.get(`${MEILISEARCH_URL}/tasks`, ({ request }) =>
      HttpResponse.json(cursorPage(all, request.url, "uids")),
    ),

  /** `GET /batches`, the same cursor, narrowed by `batchUids`. */
  batches: (all: Batch[]) =>
    http.get(`${MEILISEARCH_URL}/batches`, ({ request }) =>
      HttpResponse.json(cursorPage(all, request.url, "batchUids")),
    ),

  /** `GET /tasks/{uid}` answering the task from `all`, or the 404 body of Meilisearch. */
  task: (all: Task[]) => unitRoute("/tasks/:id", "task", all, (task) => task.uid),

  /** `GET /batches/{uid}` answering the batch from `all`, or the 404 body of Meilisearch. */
  batch: (all: Batch[]) => unitRoute("/batches/:id", "batch", all, (batch) => batch.uid),

  /** `GET /keys`, the same offset paging as the indexes. */
  keys: (all: Key[]) =>
    http.get(`${MEILISEARCH_URL}/keys`, ({ request }) =>
      HttpResponse.json(offsetPage(all, request.url)),
    ),

  /** `GET /keys/{key}` answering the key from `all`, by its uid or by its key value. */
  key: (all: Key[]) =>
    http.get(`${MEILISEARCH_URL}/keys/:key`, ({ params }) => {
      const found = all.find((key) => key.uid === params.key || key.key === params.key);
      return found === undefined
        ? HttpResponse.json(apiKeyNotFoundError, { status: 404 })
        : HttpResponse.json(found);
    }),

  /** `POST /keys`, the creation route, which answers the key it created. */
  keyCreate: (key: Key) => http.post(`${MEILISEARCH_URL}/keys`, () => HttpResponse.json(key)),

  /** `PATCH /keys/{key}`, the update route, which answers the key it changed. */
  keyUpdate: (key: Key) => http.patch(`${MEILISEARCH_URL}/keys/:key`, () => HttpResponse.json(key)),

  /** `DELETE /keys/{key}`, which answers 204 with no body. */
  keyDelete: () =>
    http.delete(`${MEILISEARCH_URL}/keys/:key`, () => new HttpResponse(null, { status: 204 })),

  /** `POST /export`, which answers the task that sends the data to the other instance. */
  export: (task: EnqueuedTask) =>
    http.post(`${MEILISEARCH_URL}/export`, () => HttpResponse.json(task)),

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

/** The error body Meilisearch returns for an API key that does not exist. */
export const apiKeyNotFoundError: MeilisearchErrorResponse = {
  message: "API key not found.",
  code: "api_key_not_found",
  type: "invalid_request",
  link: "https://docs.meilisearch.com/errors#api_key_not_found",
};

/** The 404 body Meilisearch returns for a `resource` that does not exist: `index_not_found`, `task_not_found`. */
function notFoundError(resource: string, message: string): MeilisearchErrorResponse {
  return {
    message,
    code: `${resource}_not_found`,
    type: "invalid_request",
    link: `https://docs.meilisearch.com/errors#${resource}_not_found`,
  };
}

/** `GET <path>` answering the item of `all` whose identifier is `:id`, or the 404 body of `resource`. */
function unitRoute<T>(path: string, resource: string, all: T[], idOf: (item: T) => unknown) {
  return http.get(`${MEILISEARCH_URL}${path}`, ({ params }) => {
    const found = all.find((item) => String(idOf(item)) === params.id);
    const name = `${resource[0]?.toUpperCase()}${resource.slice(1)}`;
    return found === undefined
      ? HttpResponse.json(notFoundError(resource, `${name} \`${params.id}\` not found.`), {
          status: 404,
        })
      : HttpResponse.json(found);
  });
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

export function makeBatch(overrides: Partial<Batch> & Pick<Batch, "uid">): Batch {
  return {
    progress: null,
    details: { receivedDocuments: 1, indexedDocuments: 1 },
    stats: {
      totalNbTasks: 1,
      status: { succeeded: 1 },
      types: { documentAdditionOrUpdate: 1 },
      indexUids: { movies: 1 },
    },
    duration: "PT0.001S",
    startedAt: "2026-09-24T10:00:00.000000Z",
    finishedAt: "2026-09-24T10:00:00.001000Z",
    batchStrategy: "batched all enqueued tasks",
    ...overrides,
  } as Batch;
}

/**
 * An API key as the routes of `/keys` answer it, the `key` field included. The
 * overrides are typed by name and not by value because meilisearch-js types
 * `expiresAt` as a `Date` and `name` and `description` as strings, where the
 * API answers the dates as text and both of the others as `null` when empty.
 * What the API answers is what the CLI prints.
 */
export function makeKey(overrides: Partial<Record<keyof Key, unknown>> & Pick<Key, "uid">): Key {
  return {
    name: "Default Search API Key",
    description: "Use it to search from the frontend",
    key: "115f7b0806e6eb3409870fbfef319371dff43dd036746816358c1d71ad4e2221",
    actions: ["search"],
    indexes: ["*"],
    expiresAt: null,
    createdAt: "2026-09-24T10:00:00.000000Z",
    updatedAt: "2026-09-24T10:00:00.000000Z",
    ...overrides,
  } as unknown as Key;
}
