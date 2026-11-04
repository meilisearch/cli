import { describe, expect, it } from "vitest";
import {
  commandIdFor,
  commandsOf,
  deriveCommandId,
  eachRoute,
  flagsForCommand,
  flagsForRoute,
  hasRoute,
  matchesRoutePattern,
  type OpenApiDocument,
  parseRoute,
  pathFlagsForRoute,
  projectFlagForRoute,
  routeKey,
  toKebabCase,
} from "../../src/lib/api-naming.js";
import { MeiliCliError } from "../../src/lib/errors.js";

const body = (properties: Record<string, object>) => ({
  requestBody: { content: { "application/json": { schema: { properties } } } },
});
const query = (...names: string[]) => ({
  parameters: names.map((name) => ({ name, in: "query" })),
});

/** A slice of the two real documents, enough for every rule. */
const spec: OpenApiDocument = {
  paths: {
    "/health": { get: {} },
    "/indexes": {
      get: query("offset", "limit"),
      post: {
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/IndexCreateRequest" } },
          },
        },
      },
    },
    "/indexes/{index_uid}": { get: {}, patch: body({ primaryKey: {}, uid: {} }), delete: {} },
    "/indexes/{index_uid}/stats": { get: {} },
    "/indexes/{index_uid}/documents": { get: {}, post: {}, put: {}, delete: {} },
    "/indexes/{index_uid}/documents/{document_id}": { get: {}, delete: {} },
    "/indexes/{index_uid}/documents/fetch": { post: body({ ids: {}, filter: {} }) },
    "/indexes/{index_uid}/documents/delete": { post: body({ filter: {} }) },
    "/indexes/{index_uid}/documents/delete-batch": { post: {} },
    "/indexes/{index_uid}/search": { get: {}, post: {} },
    "/indexes/{index_uid}/settings": { get: {}, patch: {}, delete: {} },
    "/indexes/{index_uid}/settings/synonyms": { get: {}, put: {}, delete: {} },
    "/indexes/{index_uid}/compact": { post: {} },
    "/tasks": { get: query("uids", "batchUids", "indexUids", "statuses"), delete: {} },
    "/tasks/cancel": { post: {} },
    "/tasks/{task_id}": { get: {} },
    "/tasks/{task_id}/documents": { get: {} },
    "/batches": { get: query("uids", "batchUids") },
    "/batches/{batch_id}": { get: {} },
    "/network": { get: {}, patch: {} },
    "/network/control": { post: {} },
    "/multi-search": { post: {} },
    "/export": { post: {} },
    "/swap-indexes": { post: {} },
    "/dumps": { post: {} },
    "/api/v2/me": { get: {} },
    "/api/v2/projects": {
      get: query("teamId"),
      post: body({ name: {}, teamId: {}, resourceId: {} }),
    },
    "/api/v2/projects/{id}": { get: {}, delete: {} },
    "/api/v2/team-members": { get: query("teamId"), post: {}, delete: {} },
  },
  components: {
    schemas: { IndexCreateRequest: { properties: { uid: {}, primaryKey: {} } } },
  },
};

const derive = (text: string): string => deriveCommandId(parseRoute(text));
const flags = (text: string, id: string): string[] =>
  [...flagsForRoute(spec, parseRoute(text), id)].sort();

describe("parseRoute", () => {
  it("reads METHOD /path and rejects anything else", () => {
    expect(parseRoute("GET /indexes")).toEqual({ method: "GET", path: "/indexes" });
    expect(routeKey(parseRoute("DELETE /indexes/{index_uid}"))).toBe("DELETE /indexes/{index_uid}");
    for (const bad of ["get /indexes", "GET indexes", "FETCH /x", ""]) {
      expect(() => parseRoute(bad), bad).toThrow(MeiliCliError);
    }
  });

  it("finds routes in the document", () => {
    expect(hasRoute(spec, parseRoute("GET /health"))).toBe(true);
    expect(hasRoute(spec, parseRoute("POST /health"))).toBe(false);
    expect(hasRoute(spec, parseRoute("GET /nope"))).toBe(false);
  });
});

describe("words", () => {
  it("writes names in kebab-case", () => {
    expect(toKebabCase("team_members")).toBe("team-members");
    expect(toKebabCase("retrieveVectors")).toBe("retrieve-vectors");
    expect(toKebabCase("searchCutoffMs")).toBe("search-cutoff-ms");
    expect(toKebabCase("indexes")).toBe("indexes");
  });
});

describe("deriveCommandId", () => {
  it("takes the resource from the last literal, in the singular, then the verb from the method", () => {
    expect(derive("GET /indexes")).toBe("index list");
    expect(derive("GET /indexes/{index_uid}")).toBe("index view");
    expect(derive("POST /indexes")).toBe("index add");
    expect(derive("PATCH /indexes/{index_uid}")).toBe("index update");
    expect(derive("DELETE /indexes/{index_uid}")).toBe("index delete");
    expect(derive("POST /indexes/{index_uid}/documents")).toBe("document add");
    expect(derive("PUT /indexes/{index_uid}/documents")).toBe("document update");
    expect(derive("DELETE /indexes/{index_uid}/documents")).toBe("document delete");
    expect(derive("GET /indexes/{index_uid}/documents/{document_id}")).toBe("document view");
    expect(derive("GET /tasks/{task_id}/documents")).toBe("document list");
    expect(derive("POST /dumps")).toBe("dump add");
    expect(derive("GET /api/v2/projects/{id}")).toBe("project view");
    expect(derive("DELETE /api/v2/team-members")).toBe("team-member delete");
  });

  it("views an object that is not a collection, and names it alone when view is its only command", () => {
    expect(derive("GET /indexes/{index_uid}/settings")).toBe("settings view");
    expect(derive("PATCH /indexes/{index_uid}/settings")).toBe("settings update");
    expect(derive("GET /health")).toBe("health");
    expect(derive("GET /indexes/{index_uid}/stats")).toBe("stats");
    expect(derive("GET /api/v2/me")).toBe("me");
  });

  it("takes a trailing literal verb as the verb", () => {
    expect(derive("POST /tasks/cancel")).toBe("task cancel");
    expect(derive("POST /indexes/{index_uid}/compact")).toBe("index compact");
    expect(derive("POST /indexes/{index_uid}/documents/delete")).toBe("document delete");
    expect(derive("POST /indexes/{index_uid}/search")).toBe("index search");
    expect(derive("POST /multi-search")).toBe("multi-search");
    expect(derive("POST /export")).toBe("export");
    expect(derive("POST /swap-indexes")).toBe("swap-indexes add");
  });
});

describe("exceptions", () => {
  it("matches exact routes, any method with *, and everything under a prefix with /*", () => {
    expect(matchesRoutePattern("GET /indexes", "GET /indexes")).toBe(true);
    expect(matchesRoutePattern("GET /indexes", "POST /indexes")).toBe(false);
    expect(matchesRoutePattern("* /indexes", "DELETE /indexes")).toBe(true);
    expect(matchesRoutePattern("* /network/*", "POST /network/control")).toBe(true);
    expect(matchesRoutePattern("* /network/*", "GET /network")).toBe(false);
    expect(matchesRoutePattern("* /network/*", "GET /networks")).toBe(false);
    expect(
      matchesRoutePattern(
        "* /indexes/{index_uid}/settings/*",
        "PATCH /indexes/{index_uid}/settings",
      ),
    ).toBe(false);
  });

  it("gives the command id once the exceptions apply", () => {
    expect(commandIdFor(parseRoute("GET /indexes"))).toBe("index list");
    expect(commandIdFor(parseRoute("POST /indexes/{index_uid}/search"))).toBe("search");
    expect(commandIdFor(parseRoute("GET /indexes/{index_uid}/search"))).toBeNull();
    expect(commandIdFor(parseRoute("POST /indexes/{index_uid}/documents/fetch"))).toBe(
      "document list",
    );
    expect(commandIdFor(parseRoute("POST /indexes/{index_uid}/documents/delete-batch"))).toBe(
      "document delete",
    );
    expect(commandIdFor(parseRoute("GET /indexes/{index_uid}/documents"))).toBeNull();
    expect(commandIdFor(parseRoute("PUT /indexes/{index_uid}/settings/synonyms"))).toBeNull();
    expect(commandIdFor(parseRoute("PATCH /indexes/{index_uid}/settings"))).toBe("settings update");
    expect(commandIdFor(parseRoute("GET /tasks/{task_id}"))).toBe("task view");
    expect(commandIdFor(parseRoute("GET /batches"))).toBe("batch list");
    expect(commandIdFor(parseRoute("POST /swap-indexes"))).toBe("index swap");
    expect(commandIdFor(parseRoute("GET /version"))).toBe("info");
    expect(commandIdFor(parseRoute("GET /network"))).toBeNull();
    expect(commandIdFor(parseRoute("POST /network/control"))).toBeNull();
    expect(commandIdFor(parseRoute("GET /api/v2/projects/{id}"))).toBe("project view");
  });
});

describe("projectFlagForRoute", () => {
  it("names the flag --project can fill: id on projects, project-id under a project, nothing else", () => {
    expect(projectFlagForRoute(parseRoute("PATCH /api/v2/projects/{id}"))).toBe("id");
    expect(projectFlagForRoute(parseRoute("GET /api/v2/projects/{projectId}/cost"))).toBe(
      "project-id",
    );
    expect(projectFlagForRoute(parseRoute("POST /api/v2/projects"))).toBeUndefined();
    expect(projectFlagForRoute(parseRoute("PATCH /api/v2/teams/{id}"))).toBeUndefined();
    expect(projectFlagForRoute(parseRoute("GET /indexes/{index_uid}"))).toBeUndefined();
  });
});

describe("pathFlagsForRoute", () => {
  it("names --id for the command's own resource and the singular collection for a parent", () => {
    expect(pathFlagsForRoute(parseRoute("GET /health"), "health")).toEqual([]);
    expect(pathFlagsForRoute(parseRoute("GET /indexes/{index_uid}"), "index view")).toEqual(["id"]);
    expect(
      pathFlagsForRoute(parseRoute("DELETE /indexes/{index_uid}/documents"), "document delete"),
    ).toEqual(["index"]);
    expect(
      pathFlagsForRoute(
        parseRoute("DELETE /indexes/{index_uid}/documents/{document_id}"),
        "document delete",
      ),
    ).toEqual(["index", "id"]);
    expect(pathFlagsForRoute(parseRoute("POST /indexes/{index_uid}/search"), "search")).toEqual([
      "index",
    ]);
    expect(
      pathFlagsForRoute(parseRoute("POST /indexes/{index_uid}/compact"), "index compact"),
    ).toEqual(["id"]);
    expect(pathFlagsForRoute(parseRoute("GET /indexes/{index_uid}/stats"), "stats")).toEqual([
      "index",
    ]);
    expect(
      pathFlagsForRoute(parseRoute("GET /tasks/{task_id}/documents"), "document list"),
    ).toEqual(["task"]);
    // A parent parameter of the Management API keeps its API name: `--project` is the global flag.
    expect(
      pathFlagsForRoute(parseRoute("PATCH /api/v2/projects/{projectId}/version"), "version update"),
    ).toEqual(["project-id"]);
    expect(pathFlagsForRoute(parseRoute("GET /api/v2/projects/{id}"), "project view")).toEqual([
      "id",
    ]);
  });
});

describe("flagsForRoute", () => {
  it("takes the query parameters and the first-level body fields, in kebab-case", () => {
    expect(flags("GET /indexes", "index list")).toEqual(["limit", "offset"]);
    expect(flags("GET /health", "health")).toEqual([]);
    expect(flags("GET /api/v2/projects", "project list")).toEqual(["team-id"]);
    expect(flags("POST /api/v2/projects", "project add")).toEqual([
      "name",
      "resource-id",
      "team-id",
    ]);
  });

  it("names identifiers by what they identify, with the API spelling as an alias", () => {
    expect(flags("POST /indexes", "index add")).toEqual(["id", "primary-key", "uid"]);
    expect(flags("GET /tasks", "task list")).toEqual([
      "batch-ids",
      "batch-uids",
      "ids",
      "index-ids",
      "index-uids",
      "statuses",
      "uids",
    ]);
    expect(flags("GET /batches", "batch list")).toEqual(["batch-uids", "ids", "task-ids", "uids"]);
    expect(flags("POST /indexes/{index_uid}/documents/fetch", "document list")).toEqual([
      "filter",
      "ids",
      "index",
    ]);
  });

  it("renames uid to --new-id when --id is already the path", () => {
    expect(flags("PATCH /indexes/{index_uid}", "index update")).toEqual([
      "new-id",
      "primary-key",
      "uid",
    ]);
  });

  it("accepts the flags written in the command column of an exception", () => {
    expect(flags("POST /indexes/{index_uid}/documents/delete-batch", "document delete")).toEqual([
      "ids",
    ]);
    expect(flags("POST /swap-indexes", "index swap")).toEqual(["indexes"]);
  });
});

describe("flagsForCommand", () => {
  it("unions the path flags and the other flags of the routes", () => {
    const documents = [
      parseRoute("DELETE /indexes/{index_uid}/documents"),
      parseRoute("POST /indexes/{index_uid}/documents/delete"),
      parseRoute("POST /indexes/{index_uid}/documents/delete-batch"),
    ];
    expect([...flagsForCommand(spec, documents, "document delete")].sort()).toEqual([
      "filter",
      "ids",
      "index",
    ]);
  });
});

describe("commandsOf", () => {
  it("groups the routes of a document by command and leaves out the routes without command", () => {
    const commands = commandsOf(spec);
    expect(commands.get("index list")?.map(routeKey)).toEqual(["GET /indexes"]);
    expect(commands.get("index view")?.map(routeKey)).toEqual(["GET /indexes/{index_uid}"]);
    expect(commands.get("document delete")?.map(routeKey)).toEqual([
      "DELETE /indexes/{index_uid}/documents",
      "POST /indexes/{index_uid}/documents/delete",
      "POST /indexes/{index_uid}/documents/delete-batch",
    ]);
    expect(commands.get("search")?.map(routeKey)).toEqual(["POST /indexes/{index_uid}/search"]);
    expect(commands.has("network view")).toBe(false);
  });

  it("enumerates every route of a document", () => {
    expect(eachRoute(spec).map(routeKey)).toContain("DELETE /indexes/{index_uid}");
    expect(eachRoute(spec)).toHaveLength(
      Object.values(spec.paths).reduce((count, item) => count + Object.keys(item).length, 0),
    );
  });
});
