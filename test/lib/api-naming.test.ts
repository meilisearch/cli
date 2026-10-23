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
  routeKey,
  singular,
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
      post: body({ project: { properties: { name: {}, teamId: {}, resourceId: {} } } }),
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

  it("knows the singular of a collection", () => {
    expect(singular("indexes")).toBe("index");
    expect(singular("batches")).toBe("batch");
    expect(singular("keys")).toBe("key");
    expect(singular("projects")).toBe("project");
  });
});

describe("deriveCommandId", () => {
  it("takes the verb from the method and the resource from the last literal", () => {
    expect(derive("GET /health")).toBe("get health");
    expect(derive("GET /indexes")).toBe("get indexes");
    expect(derive("GET /indexes/{index_uid}")).toBe("get indexes");
    expect(derive("POST /indexes")).toBe("add indexes");
    expect(derive("PATCH /indexes/{index_uid}")).toBe("update indexes");
    expect(derive("DELETE /indexes/{index_uid}")).toBe("delete indexes");
    expect(derive("GET /indexes/{index_uid}/stats")).toBe("get stats");
    expect(derive("POST /indexes/{index_uid}/documents")).toBe("add documents");
    expect(derive("PUT /indexes/{index_uid}/documents")).toBe("update documents");
    expect(derive("DELETE /indexes/{index_uid}/documents")).toBe("delete documents");
    expect(derive("GET /tasks/{task_id}/documents")).toBe("get documents");
    expect(derive("POST /dumps")).toBe("add dumps");
    expect(derive("GET /api/v2/me")).toBe("get me");
    expect(derive("GET /api/v2/projects/{id}")).toBe("get projects");
    expect(derive("DELETE /api/v2/team-members")).toBe("delete team-members");
  });

  it("takes a trailing literal verb as the verb", () => {
    expect(derive("POST /tasks/cancel")).toBe("cancel tasks");
    expect(derive("POST /indexes/{index_uid}/compact")).toBe("compact indexes");
    expect(derive("POST /indexes/{index_uid}/documents/delete")).toBe("delete documents");
    expect(derive("POST /indexes/{index_uid}/search")).toBe("search indexes");
    expect(derive("POST /multi-search")).toBe("multi-search");
    expect(derive("POST /export")).toBe("export");
    expect(derive("POST /swap-indexes")).toBe("add swap-indexes");
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
    expect(commandIdFor(parseRoute("GET /indexes"))).toBe("get indexes");
    expect(commandIdFor(parseRoute("POST /indexes/{index_uid}/search"))).toBe("search");
    expect(commandIdFor(parseRoute("GET /indexes/{index_uid}/search"))).toBeNull();
    expect(commandIdFor(parseRoute("POST /indexes/{index_uid}/documents/fetch"))).toBe(
      "get documents",
    );
    expect(commandIdFor(parseRoute("POST /indexes/{index_uid}/documents/delete-batch"))).toBe(
      "delete documents",
    );
    expect(commandIdFor(parseRoute("GET /indexes/{index_uid}/documents/{document_id}"))).toBeNull();
    expect(commandIdFor(parseRoute("PUT /indexes/{index_uid}/settings/synonyms"))).toBeNull();
    expect(commandIdFor(parseRoute("PATCH /indexes/{index_uid}/settings"))).toBe("update settings");
    expect(commandIdFor(parseRoute("GET /tasks/{task_id}"))).toBeNull();
    expect(commandIdFor(parseRoute("GET /batches"))).toBe("get batches");
    expect(commandIdFor(parseRoute("POST /swap-indexes"))).toBe("swap indexes");
    expect(commandIdFor(parseRoute("GET /network"))).toBeNull();
    expect(commandIdFor(parseRoute("POST /network/control"))).toBeNull();
    expect(commandIdFor(parseRoute("GET /api/v2/projects/{id}"))).toBe("get projects");
  });
});

describe("pathFlagsForRoute", () => {
  it("names --id for the command's own resource and the singular collection for a parent", () => {
    expect(pathFlagsForRoute(parseRoute("GET /health"), "get health")).toEqual([]);
    expect(pathFlagsForRoute(parseRoute("GET /indexes/{index_uid}"), "get indexes")).toEqual([
      "id",
    ]);
    expect(
      pathFlagsForRoute(parseRoute("DELETE /indexes/{index_uid}/documents"), "delete documents"),
    ).toEqual(["index"]);
    expect(
      pathFlagsForRoute(
        parseRoute("DELETE /indexes/{index_uid}/documents/{document_id}"),
        "delete documents",
      ),
    ).toEqual(["index", "id"]);
    expect(pathFlagsForRoute(parseRoute("POST /indexes/{index_uid}/search"), "search")).toEqual([
      "index",
    ]);
    expect(
      pathFlagsForRoute(parseRoute("POST /indexes/{index_uid}/compact"), "compact indexes"),
    ).toEqual(["id"]);
    expect(pathFlagsForRoute(parseRoute("GET /indexes/{index_uid}/stats"), "get stats")).toEqual([
      "index",
    ]);
    expect(
      pathFlagsForRoute(parseRoute("GET /tasks/{task_id}/documents"), "get documents"),
    ).toEqual(["task"]);
    expect(pathFlagsForRoute(parseRoute("GET /api/v2/projects/{id}"), "get projects")).toEqual([
      "id",
    ]);
  });
});

describe("flagsForRoute", () => {
  it("takes the query parameters and the first-level body fields, in kebab-case", () => {
    expect(flags("GET /indexes", "get indexes")).toEqual(["limit", "offset"]);
    expect(flags("GET /health", "get health")).toEqual([]);
    expect(flags("GET /api/v2/projects", "get projects")).toEqual(["team-id"]);
  });

  it("unwraps a body made of one object named after the resource", () => {
    expect(flags("POST /api/v2/projects", "add projects")).toEqual([
      "name",
      "resource-id",
      "team-id",
    ]);
  });

  it("names identifiers by what they identify, with the API spelling as an alias", () => {
    expect(flags("POST /indexes", "add indexes")).toEqual(["id", "primary-key", "uid"]);
    expect(flags("GET /tasks", "get tasks")).toEqual([
      "batch-ids",
      "batch-uids",
      "ids",
      "index-ids",
      "index-uids",
      "statuses",
      "uids",
    ]);
    expect(flags("GET /batches", "get batches")).toEqual(["batch-uids", "ids", "task-ids", "uids"]);
    expect(flags("POST /indexes/{index_uid}/documents/fetch", "get documents")).toEqual([
      "filter",
      "ids",
      "index",
    ]);
  });

  it("renames uid to --new-id when --id is already the path", () => {
    expect(flags("PATCH /indexes/{index_uid}", "update indexes")).toEqual([
      "new-id",
      "primary-key",
      "uid",
    ]);
  });

  it("accepts the flags written in the command column of an exception", () => {
    expect(flags("POST /indexes/{index_uid}/documents/delete-batch", "delete documents")).toEqual([
      "ids",
    ]);
    expect(flags("POST /swap-indexes", "swap indexes")).toEqual(["indexes"]);
  });
});

describe("flagsForCommand", () => {
  it("unions the routes and adds --id as an alias of --ids when no route takes a path id", () => {
    const documents = [parseRoute("POST /indexes/{index_uid}/documents/fetch")];
    expect([...flagsForCommand(spec, documents, "get documents")].sort()).toEqual([
      "filter",
      "id",
      "ids",
      "index",
    ]);
    const indexes = [parseRoute("GET /indexes"), parseRoute("GET /indexes/{index_uid}")];
    expect([...flagsForCommand(spec, indexes, "get indexes")].sort()).toEqual([
      "id",
      "limit",
      "offset",
    ]);
  });
});

describe("commandsOf", () => {
  it("groups the routes of a document by command and leaves out the routes without command", () => {
    const commands = commandsOf(spec);
    expect(commands.get("get indexes")?.map(routeKey)).toEqual([
      "GET /indexes",
      "GET /indexes/{index_uid}",
    ]);
    expect(commands.get("delete documents")?.map(routeKey)).toEqual([
      "DELETE /indexes/{index_uid}/documents",
      "POST /indexes/{index_uid}/documents/delete",
      "POST /indexes/{index_uid}/documents/delete-batch",
    ]);
    expect(commands.get("search")?.map(routeKey)).toEqual(["POST /indexes/{index_uid}/search"]);
    expect(commands.has("get network")).toBe(false);
  });

  it("enumerates every route of a document", () => {
    expect(eachRoute(spec).map(routeKey)).toContain("DELETE /indexes/{index_uid}");
    expect(eachRoute(spec)).toHaveLength(
      Object.values(spec.paths).reduce((count, item) => count + Object.keys(item).length, 0),
    );
  });
});
