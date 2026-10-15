/**
 * msw handlers for the Management API, following openapi/management.json. The
 * host is fake: msw intercepts fetch before any DNS lookup, and an unhandled
 * request is an error.
 */
import { HttpResponse, http } from "msw";
import type { Project } from "../../src/lib/clients/management/generated/types.gen.js";

export const MANAGEMENT_URL = "https://management.test";
export const MANAGEMENT_TOKEN = "mspat_testtoken1a2b";
/** The environment of a management command test. */
export const managementEnv = {
  MEILI_MANAGEMENT_TOKEN: MANAGEMENT_TOKEN,
  MEILI_MANAGEMENT_URL: MANAGEMENT_URL,
};

/** A project as the API returns it; `masterKey` is a secret by design (output.md, "Pass-through"). */
export const project: Project = {
  id: 343,
  name: "demo",
  projectUid: "ms-abc",
  url: "https://ms-abc.sfo.meilisearch.io",
  masterKey: "projectmasterkey9z8y",
  teamId: 12,
  resourceId: 3,
  msVersion: "v1.54.0",
  workloadType: "production",
  readOnly: false,
  status: "running",
  paused: false,
  createdAt: "2026-10-14T10:00:00Z",
  resource: { id: 3, name: "build", plan: "build", regionId: 1 },
};

/** What a handler saw: the URL, the `Authorization` header and the parsed body. */
export interface ReceivedRequest {
  url: string;
  authorization: string | null;
  body: unknown;
}

/** Parses the JSON body, if any, and records it with the URL and the `Authorization` header. */
async function record(received: ReceivedRequest[], request: Request): Promise<unknown> {
  const body: unknown = request.method === "GET" ? undefined : await request.json();
  received.push({ url: request.url, authorization: request.headers.get("authorization"), body });
  return body;
}

export const managementHandlers = {
  /** `GET /api/v2/projects` answering `all`, as the API lists what the token sees. */
  listProjects: (all: Project[], received: ReceivedRequest[] = []) =>
    http.get(`${MANAGEMENT_URL}/api/v2/projects`, async ({ request }) => {
      await record(received, request);
      return HttpResponse.json(all);
    }),

  /** `POST /api/v2/projects` answering 201 with `project` carrying the attributes received. */
  createProject: (received: ReceivedRequest[] = []) =>
    http.post(`${MANAGEMENT_URL}/api/v2/projects`, async ({ request }) => {
      const attributes = (await record(received, request)) as Record<string, unknown>;
      return HttpResponse.json({ ...project, ...attributes }, { status: 201 });
    }),

  /** `PATCH /api/v2/projects/{id}` answering 200 with `project` carrying the attributes received. */
  updateProject: (received: ReceivedRequest[] = []) =>
    http.patch(`${MANAGEMENT_URL}/api/v2/projects/:id`, async ({ request }) => {
      const body = (await record(received, request)) as { project?: Record<string, unknown> };
      return HttpResponse.json({ ...project, ...body.project });
    }),

  /** `DELETE /api/v2/projects/{id}` answering 204. */
  deleteProject: () =>
    http.delete(
      `${MANAGEMENT_URL}/api/v2/projects/:id`,
      () => new HttpResponse(null, { status: 204 }),
    ),

  /** Any method on `path` answering `status`, with the body the running API sends or none. */
  apiError: (path: string, status: number, body?: unknown) =>
    http.all(`${MANAGEMENT_URL}${path}`, () =>
      body === undefined ? new HttpResponse(null, { status }) : HttpResponse.json(body, { status }),
    ),

  /** Any method on `path` failing at the network level. */
  networkError: (path: string) => http.all(`${MANAGEMENT_URL}${path}`, () => HttpResponse.error()),
};
