/**
 * Derives command names and flags from API routes, as specified in
 * docs/contract/commands.md, "Naming rules". The contract tests and
 * `pnpm api:coverage` use it against the downloaded OpenAPI documents.
 */
import { MeiliCliError } from "./errors.js";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type Method = (typeof METHODS)[number];

export interface Route {
  method: Method;
  path: string;
}

/** Flags the CLI owns. Every other flag of an API command comes from a route. */
export const CLI_OWNED_FLAGS: readonly string[] = ["wait", "timeout", "all", "file", "data", "yes"];

/** Trailing path literals that are verbs (rule 1). A closed list: adding one is a contract change. */
export const LITERAL_VERBS: readonly string[] = [
  "delete",
  "cancel",
  "compact",
  "swap",
  "search",
  "similar",
  "facet-search",
  "multi-search",
  "export",
];

const METHOD_VERBS: Record<Method, string> = {
  GET: "get",
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

/**
 * API parameters that carry identifiers, and what they identify (rule 5): the
 * command's own resource gives `--id` or `--ids`, another resource gives
 * `--<resource>-ids`. The API spelling stays accepted as an alias.
 */
const IDENTIFIERS: Record<string, { of: "own" | string; flag: "id" | "ids" }> = {
  uid: { of: "own", flag: "id" },
  uids: { of: "task", flag: "ids" },
  batchUids: { of: "batch", flag: "ids" },
  indexUids: { of: "index", flag: "ids" },
};

// OpenAPI, the little the rules read from it

interface OpenApiParameter {
  name: string;
  in: string;
}

interface OpenApiSchema {
  $ref?: string;
  properties?: Record<string, OpenApiSchema>;
  allOf?: OpenApiSchema[];
}

interface OpenApiOperation {
  parameters?: OpenApiParameter[];
  requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> };
  security?: Array<Record<string, string[]>>;
}

type OpenApiPathItem = { parameters?: OpenApiParameter[] } & Partial<
  Record<Lowercase<Method>, OpenApiOperation>
>;

export interface OpenApiDocument {
  paths: Record<string, OpenApiPathItem>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

/** `"GET /indexes"` into a route. */
export function parseRoute(text: string): Route {
  const match = text.match(/^(GET|POST|PUT|PATCH|DELETE) (\/\S*)$/);
  if (match === null) {
    throw new MeiliCliError(
      "cli_internal",
      `Invalid route \`${text}\`: expected "<METHOD> /path" with an upper-case method.`,
    );
  }
  return { method: match[1] as Method, path: match[2] ?? "/" };
}

export function routeKey(route: Route): string {
  return `${route.method} ${route.path}`;
}

function findOperation(spec: OpenApiDocument, route: Route): OpenApiOperation | undefined {
  return spec.paths[route.path]?.[route.method.toLowerCase() as Lowercase<Method>];
}

export function hasRoute(spec: OpenApiDocument, route: Route): boolean {
  return findOperation(spec, route) !== undefined;
}

/**
 * The key actions the routes require, the specific one of each: the document
 * lists them from the most specific to the widest wildcard, `["indexes.get",
 * "indexes.*", "*"]`, and a command declares the first one in `keyActions`.
 * Empty when the routes need no key action, as on `GET /health`, and on the
 * Management API, whose personal access token declares no scope.
 */
export function keyActionsForRoutes(spec: OpenApiDocument, routes: readonly Route[]): string[] {
  const actions = new Set<string>();
  for (const route of routes) {
    for (const scheme of findOperation(spec, route)?.security ?? []) {
      const specific = Object.values(scheme)[0]?.[0];
      if (specific !== undefined) actions.add(specific);
    }
  }
  return [...actions].sort();
}

/** Every route of an OpenAPI document. */
export function eachRoute(spec: OpenApiDocument): Route[] {
  const routes: Route[] = [];
  for (const path of Object.keys(spec.paths)) {
    for (const method of METHODS) {
      if (findOperation(spec, { method, path }) !== undefined) routes.push({ method, path });
    }
  }
  return routes;
}

// Exceptions

/**
 * A route whose derived name is wrong, ambiguous or collides with another one,
 * or a route declared without command (`command: null`). The table in
 * commands.md mirrors this list: same routes, same commands, same reasons.
 *
 * `route` is `METHOD /path` as written in the OpenAPI document. `*` as the
 * method matches every method, and a path ending with `/*` matches every route
 * under that prefix, not the prefix itself. `command` is written as in the
 * table: the command id, then the flags that distinguish the route, which the
 * route accepts.
 */
interface RouteException {
  route: string;
  command: string | null;
  reason: string;
}

export const ROUTE_EXCEPTIONS: readonly RouteException[] = [
  {
    route: "GET /indexes/{index_uid}/search",
    command: null,
    reason:
      "Twin of the POST route, which takes the same parameters in a body. The CLI implements POST.",
  },
  {
    route: "POST /indexes/{index_uid}/search",
    command: "search --index",
    reason: "Verb only, the most typed command.",
  },
  {
    route: "GET /indexes/{index_uid}/similar",
    command: null,
    reason: "Twin of the POST route. The CLI implements POST.",
  },
  {
    route: "POST /indexes/{index_uid}/similar",
    command: "similar --index",
    reason: "Verb only, like `search`. `--id` is the API field: the document to compare with.",
  },
  {
    route: "POST /indexes/{index_uid}/facet-search",
    command: "facet-search --index",
    reason: "Verb only, like `search`.",
  },
  {
    route: "POST /multi-search",
    command: "multi-search",
    reason: "Verb only, like `search`. No index: the queries name theirs.",
  },
  {
    route: "POST /export",
    command: "export",
    reason: "Verb only: the route has no resource.",
  },
  {
    route: "POST /swap-indexes",
    command: "swap indexes --indexes",
    reason:
      "The literal holds the verb and the resource. `--indexes a,b` swaps one pair; several pairs go through `--data` or `--file`.",
  },
  {
    route: "GET /indexes/{index_uid}/documents",
    command: null,
    reason: "Covered by `get documents`, which uses the fetch route and its body.",
  },
  {
    route: "POST /indexes/{index_uid}/documents/fetch",
    command: "get documents --index",
    reason:
      "A POST that lists: filters, fields and pagination travel in its body. `--id` is an alias of `--ids`.",
  },
  {
    route: "GET /indexes/{index_uid}/documents/{document_id}",
    command: null,
    reason: "Covered by `get documents --ids`.",
  },
  {
    route: "DELETE /indexes/{index_uid}/documents/{document_id}",
    command: null,
    reason: "Covered by `delete documents --ids`.",
  },
  {
    route: "POST /indexes/{index_uid}/documents/delete-batch",
    command: "delete documents --ids",
    reason:
      "The body is an array of identifiers without a name; `--ids` is the name of the fetch route.",
  },
  {
    route: "POST /indexes/{index_uid}/fields",
    command: "get fields --index",
    reason: "A POST that lists.",
  },
  {
    route: "* /indexes/{index_uid}/settings/*",
    command: null,
    reason: "`update settings` sends any subset of the settings; `null` resets one of them.",
  },
  {
    route: "GET /tasks/{task_id}",
    command: null,
    reason: "Covered by `get tasks --ids`, which filters `uids`.",
  },
  {
    route: "GET /batches/{batch_id}",
    command: null,
    reason: "Covered by `get batches --ids`.",
  },
  {
    route: "POST /tasks/compact",
    command: "compact tasks",
    reason: "Experimental (`taskQueueCompactionRoute`), kept on purpose.",
  },
  {
    route: "GET /api/v2/meilisearch-versions",
    command: null,
    reason: "Not needed for now.",
  },
  {
    route: "* /chats",
    command: null,
    reason: "Experimental (`chatCompletions`). Out of the contract until stable.",
  },
  { route: "* /chats/*", command: null, reason: "Experimental (`chatCompletions`)." },
  { route: "GET /metrics", command: null, reason: "Experimental (`metrics`)." },
  { route: "* /logs/*", command: null, reason: "Experimental (`logsRoute`)." },
  { route: "POST /render-template", command: null, reason: "Experimental (`renderRoute`)." },
  {
    route: "POST /indexes/{index_uid}/documents/edit",
    command: null,
    reason: "Experimental (`editDocumentsByFunction`).",
  },
  {
    route: "* /dynamic-search-rules",
    command: null,
    reason: "Experimental (`dynamicSearchRules`).",
  },
  {
    route: "* /dynamic-search-rules/*",
    command: null,
    reason: "Experimental (`dynamicSearchRules`).",
  },
  { route: "* /network", command: null, reason: "Experimental (`network`)." },
  { route: "* /network/*", command: null, reason: "Experimental (`network`)." },
  {
    route: "GET /tasks/stream",
    command: null,
    reason:
      "Experimental (`tasksStreamingRoute`). The CLI may use it internally for `--wait`, see issue #1.",
  },
  {
    route: "GET /batches/stream",
    command: null,
    reason: "Experimental (`tasksStreamingRoute`).",
  },
  {
    route: "GET /tasks/{task_id}/documents",
    command: null,
    reason: "Experimental (`getTaskDocumentsRoute`).",
  },
  {
    route: "* /experimental-features",
    command: null,
    reason: "Toggles experimental features; the CLI does not expose it for now.",
  },
  {
    route: "POST /mcp",
    command: null,
    reason:
      "Meilisearch serves its own MCP endpoint; the CLI does not proxy it. The name `mcp` stays reserved for this route: a CLI-side MCP server, if ever built, takes another name.",
  },
];

/** True when `pattern` (an exception route) matches the exact route `key`. */
export function matchesRoutePattern(pattern: string, key: string): boolean {
  const [patternMethod, patternPath] = pattern.split(" ", 2);
  const [method, path] = key.split(" ", 2);
  if (patternPath === undefined || path === undefined) return false;
  if (patternMethod !== "*" && patternMethod !== method) return false;
  if (patternPath.endsWith("/*")) return path.startsWith(patternPath.slice(0, -1));
  return patternPath === path;
}

function findRouteException(route: Route): RouteException | undefined {
  const key = routeKey(route);
  return ROUTE_EXCEPTIONS.find((exception) => matchesRoutePattern(exception.route, key));
}

/** `"get documents --index"` is the command `get documents` with the flag `index`. */
function parseCommand(command: string): { id: string; flags: string[] } {
  const [id = command, ...flags] = command.split(" --");
  return { id, flags };
}

// Naming

const VERSION_PREFIX = /^\/api\/v\d+(?=\/|$)/;

/** Path segments without the `/api/v2` prefix of the Management API. */
function pathSegments(path: string): string[] {
  return path
    .replace(VERSION_PREFIX, "")
    .split("/")
    .filter((segment) => segment !== "");
}

function isParameter(segment: string): boolean {
  return segment.startsWith("{") && segment.endsWith("}");
}

/** `team_members` and `retrieveVectors` become `team-members` and `retrieve-vectors`. */
export function toKebabCase(name: string): string {
  return name
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/** `indexes` gives `index`, `batches` gives `batch`, `keys` gives `key`. */
export function singular(word: string): string {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(xes|ches|shes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * The command id of a route before exceptions: the verb, then the resource
 * (rules 1 and 2). `GET /indexes/{index_uid}` is `get indexes`,
 * `POST /tasks/cancel` is `cancel tasks`, `POST /export` is `export`.
 */
export function deriveCommandId(route: Route): string {
  const literals = pathSegments(route.path)
    .filter((segment) => !isParameter(segment))
    .map(toKebabCase);
  const last = literals.at(-1);
  if (last !== undefined && LITERAL_VERBS.includes(last)) {
    const resource = literals.at(-2);
    return resource === undefined ? last : `${last} ${resource}`;
  }
  return [METHOD_VERBS[route.method], last].filter((word) => word !== undefined).join(" ");
}

/**
 * The command id of a route once the exceptions are applied, or null for a
 * route declared without command.
 */
export function commandIdFor(route: Route): string | null {
  const exception = findRouteException(route);
  if (exception !== undefined) {
    return exception.command === null ? null : parseCommand(exception.command).id;
  }
  return deriveCommandId(route);
}

/** The second word of a command id: `documents` in `get documents`, undefined for `search`. */
function resourceOf(commandId: string): string | undefined {
  return commandId.split(" ")[1];
}

/**
 * The flags that carry the path parameters of a route, in path order (rule 4):
 * `id` for the parameter of the command's own resource, the singular of the
 * collection for a parent. `GET /indexes/{index_uid}/documents/{document_id}`
 * under `delete documents` gives `["index", "id"]`.
 */
export function pathFlagsForRoute(route: Route, commandId: string): string[] {
  const resource = resourceOf(commandId);
  const segments = pathSegments(route.path);
  return segments.flatMap((segment, index) => {
    if (!isParameter(segment)) return [];
    const collection = toKebabCase(segments[index - 1] ?? "");
    return [collection === resource ? "id" : singular(collection)];
  });
}

function resolveSchema(
  spec: OpenApiDocument,
  schema: OpenApiSchema | undefined,
): OpenApiSchema | undefined {
  if (schema?.$ref === undefined) return schema;
  const name = schema.$ref.split("/").at(-1) ?? "";
  return spec.components?.schemas?.[name];
}

function schemaProperties(
  spec: OpenApiDocument,
  schema: OpenApiSchema | undefined,
): Record<string, OpenApiSchema> {
  const resolved = resolveSchema(spec, schema);
  if (resolved === undefined) return {};
  const inherited = (resolved.allOf ?? []).map((part) => schemaProperties(spec, part));
  return Object.assign({}, ...inherited, resolved.properties ?? {});
}

/**
 * The first-level fields of a JSON body (rule 6). A body made of one object
 * property named after the resource, `{"project": {...}}`, is unwrapped.
 */
function bodyFields(
  spec: OpenApiDocument,
  operation: OpenApiOperation,
  resource: string | undefined,
): string[] {
  const fields = schemaProperties(
    spec,
    operation.requestBody?.content?.["application/json"]?.schema,
  );
  const names = Object.keys(fields);
  const wrapper = names[0];
  if (names.length === 1 && wrapper !== undefined && resource !== undefined) {
    const inner = schemaProperties(spec, fields[wrapper]);
    if (wrapper === singular(resource) && Object.keys(inner).length > 0) return Object.keys(inner);
  }
  return names;
}

/**
 * The flags a route accepts besides its path flags (rules 5 and 6): its query
 * parameters and body fields in kebab-case, the identifiers among them named
 * by what they identify with the API spelling as an alias, the `--new-id` of
 * `update indexes`, and the flags of its exception.
 */
export function flagsForRoute(spec: OpenApiDocument, route: Route, commandId: string): Set<string> {
  const operation = findOperation(spec, route);
  if (operation === undefined) return new Set();
  const resource = resourceOf(commandId);
  const hasPathId = pathFlagsForRoute(route, commandId).includes("id");
  const exception = findRouteException(route)?.command;
  const flags = new Set(
    exception === null || exception === undefined ? [] : parseCommand(exception).flags,
  );
  const query = [...(spec.paths[route.path]?.parameters ?? []), ...(operation.parameters ?? [])]
    .filter((parameter) => parameter.in === "query")
    .map((parameter) => parameter.name);

  for (const name of [...query, ...bodyFields(spec, operation, resource)]) {
    const identifier = IDENTIFIERS[name];
    if (identifier !== undefined) {
      const own =
        identifier.of === "own" || (resource !== undefined && identifier.of === singular(resource));
      if (own && identifier.flag === "id" && hasPathId) flags.add("new-id");
      else flags.add(own ? identifier.flag : `${identifier.of}-${identifier.flag}`);
    }
    flags.add(toKebabCase(name));
  }
  return flags;
}

/**
 * Every flag a command accepts, over all of its routes, with `--id` as an
 * alias of `--ids` when no route takes a path `id` (rule 4).
 */
export function flagsForCommand(
  spec: OpenApiDocument,
  routes: readonly Route[],
  commandId: string,
): Set<string> {
  const flags = new Set<string>();
  for (const route of routes) {
    for (const flag of pathFlagsForRoute(route, commandId)) flags.add(flag);
    for (const flag of flagsForRoute(spec, route, commandId)) flags.add(flag);
  }
  const hasPathId = routes.some((route) => pathFlagsForRoute(route, commandId).includes("id"));
  if (flags.has("ids") && !hasPathId) flags.add("id");
  return flags;
}

/** The routes of a document grouped by the command that covers them; routes without command are left out. */
export function commandsOf(spec: OpenApiDocument): Map<string, Route[]> {
  const commands = new Map<string, Route[]>();
  for (const route of eachRoute(spec)) {
    const id = commandIdFor(route);
    if (id === null) continue;
    commands.set(id, [...(commands.get(id) ?? []), route]);
  }
  return commands;
}
