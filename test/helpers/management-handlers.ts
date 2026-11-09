/**
 * msw handlers for the Management API, following openapi/management.json. The
 * host is fake: msw intercepts fetch before any DNS lookup, and an unhandled
 * request is an error.
 */
import { HttpResponse, http } from "msw";
import type {
  Error as ApiError,
  Organization,
  Project,
  Region,
  Resource,
  Team,
} from "../../src/lib/clients/management/generated/types.gen.js";

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
  readOnly: false,
  status: "running",
  paused: false,
  createdAt: "2026-10-14T10:00:00Z",
  resource: { id: 3, name: "build", displayName: "Build", plan: "build", regionId: 1 },
};

/** The resource of `project`, as `GET /api/v2/resources` returns it. */
export const resource: Resource = {
  id: 3,
  name: "build",
  displayName: "Build",
  plan: "build",
  regionId: 1,
  storage: 10,
  memory: 1,
  vcpu: 0.5,
  fullPlan: null,
};

/** The team of `project`, as `GET /api/v2/teams` returns it. */
export const team: Team = {
  id: 12,
  name: "Search",
  organizationId: 1,
  ownerId: "user-1",
  isAdmin: true,
};

/** A region as `GET /api/v2/regions` returns it. */
export const region: Region = {
  id: 1,
  name: "San Francisco",
  awsRegion: "us-west-1",
  countryCode: "US",
  regionUrl: "sfo.meilisearch.io",
};

/** The organization of `team`, as `GET /api/v2/organizations/{id}` returns it. */
export const organization: Organization = {
  id: 1,
  name: "Acme",
  identifier: "acme",
  ownerId: "user-1",
  isAdmin: true,
  defaultTeamId: 12,
  customerTier: null,
};

/** An error body as the document describes it: the same shape as a Meilisearch one. */
export const forbidden: ApiError = {
  message: "You cannot access this project.",
  code: "project_not_accessible",
  type: "auth",
  link: "https://www.meilisearch.com/docs/reference/errors#project_not_accessible",
};

/** The 404 of a team route on an id the token does not see. */
export const teamNotFound: ApiError = {
  message: "Team not found.",
  code: "team_not_found",
  type: "invalid_request",
  link: "https://www.meilisearch.com/docs/reference/errors#team_not_found",
};

/** The 403 of the master key route to a member who is not an owner. */
export const notOwner: ApiError = {
  message: "Only team and organization owners can read the master key.",
  code: "not_an_owner",
  type: "auth",
  link: "https://www.meilisearch.com/docs/reference/errors#not_an_owner",
};

/** Page `page` of `items`, `limit` per page, in the envelope of the document. */
function onePage<T>(items: T[], page: number, limit: number) {
  return {
    page,
    limit,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / limit)),
    results: items.slice((page - 1) * limit, page * limit),
  };
}

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
  /**
   * `GET /api/v2/projects` answering the projects of `all`, of the `teamId`
   * asked if any, `limit` per page, in the envelope of the document.
   */
  listProjects: (all: Project[], received: ReceivedRequest[] = [], limit = 20) =>
    http.get(`${MANAGEMENT_URL}/api/v2/projects`, async ({ request }) => {
      await record(received, request);
      const query = new URL(request.url).searchParams;
      const teamId = query.get("teamId");
      const matching = all.filter((each) => teamId === null || String(each.teamId) === teamId);
      return HttpResponse.json(onePage(matching, Number(query.get("page") ?? "1"), limit));
    }),

  /** `GET /api/v2/resources` answering the resources of `all` in the `regionId` asked if any, on one page. */
  listResources: (all: Resource[], received: ReceivedRequest[] = []) =>
    http.get(`${MANAGEMENT_URL}/api/v2/resources`, async ({ request }) => {
      await record(received, request);
      const regionId = new URL(request.url).searchParams.get("regionId");
      const matching = all.filter(
        (each) => regionId === null || String(each.regionId) === regionId,
      );
      return HttpResponse.json(onePage(matching, 1, 20));
    }),

  /** `GET /api/v2/teams` answering `all` on one page. */
  listTeams: (all: Team[] = [team]) =>
    http.get(`${MANAGEMENT_URL}/api/v2/teams`, () => HttpResponse.json(onePage(all, 1, 20))),

  /** `GET /api/v2/teams/{id}` answering `team` with the id asked. */
  getTeam: () =>
    http.get(`${MANAGEMENT_URL}/api/v2/teams/:id`, ({ params }) =>
      HttpResponse.json({ ...team, id: Number(params.id) }),
    ),

  /** `POST /api/v2/teams` answering 201 with `team` carrying the attributes received. */
  createTeam: (received: ReceivedRequest[]) =>
    http.post(`${MANAGEMENT_URL}/api/v2/teams`, async ({ request }) => {
      const attributes = (await record(received, request)) as Record<string, unknown>;
      return HttpResponse.json({ ...team, ...attributes }, { status: 201 });
    }),

  /** `PATCH /api/v2/teams/{id}` answering 200 with `team` carrying the attributes received. */
  updateTeam: (received: ReceivedRequest[]) =>
    http.patch(`${MANAGEMENT_URL}/api/v2/teams/:id`, async ({ request }) => {
      const body = (await record(received, request)) as Record<string, unknown>;
      return HttpResponse.json({ ...team, ...body });
    }),

  /** `GET /api/v2/regions` answering `all` on one page. */
  listRegions: (all: Region[]) =>
    http.get(`${MANAGEMENT_URL}/api/v2/regions`, () => HttpResponse.json(onePage(all, 1, 20))),

  /**
   * `GET /api/v2/projects/{projectId}/master-key` answering the project of
   * `all` with `masterKey-<id>`, or the API's 403 to a member who is not an owner.
   */
  masterKey: (all: Project[], received: ReceivedRequest[] = []) =>
    http.get(`${MANAGEMENT_URL}/api/v2/projects/:id/master-key`, async ({ request, params }) => {
      await record(received, request);
      const found = all.find((each) => String(each.id) === params.id);
      return found === undefined
        ? HttpResponse.json(notOwner, { status: 403 })
        : HttpResponse.json({ ...found, masterKey: `masterKey-${found.id}` });
    }),

  /** `POST /api/v2/projects` answering 201 with `project` carrying the attributes received. */
  createProject: (received: ReceivedRequest[] = []) =>
    http.post(`${MANAGEMENT_URL}/api/v2/projects`, async ({ request }) => {
      const attributes = (await record(received, request)) as Record<string, unknown>;
      return HttpResponse.json({ ...project, ...attributes }, { status: 201 });
    }),

  /** `GET /api/v2/projects/{id}` answering the project of `all` with that id, or the API's 403. */
  getProject: (all: Project[]) =>
    http.get(`${MANAGEMENT_URL}/api/v2/projects/:id`, ({ params }) => {
      const found = all.find((project) => String(project.id) === params.id);
      return found === undefined
        ? HttpResponse.json(forbidden, { status: 403 })
        : HttpResponse.json(found);
    }),

  /** `PATCH /api/v2/projects/{id}` answering 200 with `project` carrying the attributes received. */
  updateProject: (received: ReceivedRequest[] = []) =>
    http.patch(`${MANAGEMENT_URL}/api/v2/projects/:id`, async ({ request }) => {
      const body = (await record(received, request)) as Record<string, unknown>;
      return HttpResponse.json({ ...project, ...body });
    }),

  /** `DELETE /api/v2/projects/{id}` answering 204. */
  deleteProject: () =>
    http.delete(
      `${MANAGEMENT_URL}/api/v2/projects/:id`,
      () => new HttpResponse(null, { status: 204 }),
    ),

  /** `GET /api/v2/organizations` answering `all` on one page. */
  listOrganizations: (all: Organization[]) =>
    http.get(`${MANAGEMENT_URL}/api/v2/organizations`, () =>
      HttpResponse.json(onePage(all, 1, 20)),
    ),

  /** `GET /api/v2/organizations/{id}` answering the organization of `all` with that id, or the API's 403. */
  getOrganization: (all: Organization[]) =>
    http.get(`${MANAGEMENT_URL}/api/v2/organizations/:id`, ({ params }) => {
      const found = all.find((each) => String(each.id) === params.id);
      return found === undefined
        ? HttpResponse.json(forbidden, { status: 403 })
        : HttpResponse.json(found);
    }),

  /** `PATCH /api/v2/organizations/{id}` answering 200 with `organization` carrying the attributes received. */
  updateOrganization: (received: ReceivedRequest[]) =>
    http.patch(`${MANAGEMENT_URL}/api/v2/organizations/:id`, async ({ request }) => {
      const body = (await record(received, request)) as Record<string, unknown>;
      return HttpResponse.json({ ...organization, ...body });
    }),

  /** `DELETE /api/v2/organizations/{id}` answering 204. */
  deleteOrganization: () =>
    http.delete(
      `${MANAGEMENT_URL}/api/v2/organizations/:id`,
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
