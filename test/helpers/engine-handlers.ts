/**
 * msw handlers for the engine API. The host is fake: msw intercepts fetch before
 * any DNS lookup, and an unhandled request is an error.
 */

import type { Task } from "meilisearch";
import { HttpResponse, http } from "msw";

export const ENGINE_URL = "http://meili.test:7700";

export const engineHandlers = {
  /** `GET /health` answering `{ "status": "available" }`. */
  health: (url = ENGINE_URL) =>
    http.get(`${url}/health`, () => HttpResponse.json({ status: "available" })),

  /** Any method on `path` answering a Meilisearch error body with `status`. */
  apiError: (
    path: string,
    status: number,
    body: { message: string; code: string; type: string; link: string },
    url = ENGINE_URL,
  ) => http.all(`${url}${path}`, () => HttpResponse.json(body, { status })),

  /** Any method on `path` answering a non-Meilisearch body, like a proxy would. */
  foreignError: (path: string, status: number, url = ENGINE_URL) =>
    http.all(`${url}${path}`, () => HttpResponse.text("Bad gateway", { status })),

  /** Any method on `path` failing at the network level. */
  networkError: (path: string, url = ENGINE_URL) =>
    http.all(`${url}${path}`, () => HttpResponse.error()),

  /** `GET /tasks/{uid}` answering the given tasks in order, then the last one forever. */
  taskSequence: (uid: number, tasks: Task[], url = ENGINE_URL) => {
    let index = 0;
    return http.get(`${url}/tasks/${uid}`, () => {
      const task = tasks[Math.min(index, tasks.length - 1)];
      index += 1;
      return HttpResponse.json(task);
    });
  },
};

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
