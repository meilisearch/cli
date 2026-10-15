/**
 * Every API command covers the routes of its verb and resource, derives its
 * name and flags from them, and each route is reachable by a distinct set of
 * flags. See docs/contract/commands.md, "Naming rules" and "Exceptions".
 */
import { existsSync, readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLI_OWNED_FLAGS,
  commandIdFor,
  commandsOf,
  eachRoute,
  flagsForCommand,
  flagsForRoute,
  hasRoute,
  LITERAL_VERBS,
  matchesRoutePattern,
  type OpenApiDocument,
  parseRoute,
  pathFlagsForRoute,
  ROUTE_EXCEPTIONS,
  routeKey,
} from "../../src/lib/api-naming.js";
import { BaseCommand } from "../../src/lib/base-command.js";
import { PROJECT_ROOT } from "../helpers/run-command.js";
import { codeSpans, readDoc, section, tableRows } from "./markdown.js";

function loadSpec(api: "meilisearch" | "management"): OpenApiDocument | undefined {
  const path = join(PROJECT_ROOT, "openapi", `${api}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as OpenApiDocument) : undefined;
}

const meilisearch = loadSpec("meilisearch");
if (meilisearch === undefined) {
  throw new Error(
    "openapi/meilisearch.json is missing. Run `pnpm openapi` to download the OpenAPI document of the latest Meilisearch release. No command is checked, or written, without it.",
  );
}
const specs = { meilisearch, management: loadSpec("management") };
const documentedRoutes = [
  ...eachRoute(meilisearch),
  ...(specs.management === undefined ? [] : eachRoute(specs.management)),
];
const derived = {
  meilisearch: commandsOf(meilisearch),
  management: specs.management === undefined ? undefined : commandsOf(specs.management),
};

interface CommandClass {
  api?: unknown;
  routes?: unknown;
  args?: Record<string, unknown>;
  flags?: Record<string, { required?: boolean; aliases?: string[] }>;
}

const files: string[] = [];
for await (const file of glob("src/commands/**/*.ts", { cwd: PROJECT_ROOT })) files.push(file);
const commands = await Promise.all(
  files.map(async (file) => ({
    file,
    id: file.slice("src/commands/".length, -".ts".length).split("/").join(" "),
    command: ((await import(join(PROJECT_ROOT, file))) as { default: CommandClass }).default,
  })),
);

const globalFlags = Object.keys(BaseCommand.baseFlags);
const VERBS = ["get", "create", "update", "delete", ...LITERAL_VERBS];

/** The commands of the "Commands that do not derive from a route" table of commands.md. */
const listedCommands = tableRows(
  section(readDoc("docs/contract/commands.md"), "Commands that do not derive from a route"),
)
  .map(([command = ""]) => codeSpans(command)[0] ?? "")
  .map((usage) => {
    const words = usage.replace(/^meili /, "").split(" ");
    const end = words.findIndex((word) => /^[-([]/.test(word));
    return words.slice(0, end === -1 ? words.length : end).join(" ");
  })
  .filter((id) => id !== "");

const hasRoutes = (command: CommandClass): boolean =>
  Array.isArray(command.routes) && command.routes.length > 0;

describe("API commands derive from their routes", () => {
  for (const { id, file, command } of commands) {
    if ((command.api !== "meilisearch" && command.api !== "management") || !hasRoutes(command)) {
      continue;
    }
    const api = command.api;
    const spec = specs[api];

    it(`meili ${id}`, () => {
      if (spec === undefined) {
        throw new Error(
          `openapi/management.json is missing and ${file} needs it. Run \`pnpm openapi:management\` with a GitHub token that reads meilisearch/meilisearch-cloud.`,
        );
      }
      const routes = (command.routes as string[]).map(parseRoute);
      for (const route of routes) {
        expect(hasRoute(spec, route), `${routeKey(route)} is not in the OpenAPI document`).toBe(
          true,
        );
        expect(commandIdFor(route), `${routeKey(route)} belongs to another command`).toBe(id);
      }
      const expected = (derived[api]?.get(id) ?? []).map(routeKey).sort();
      expect(
        [...(command.routes as string[])].sort(),
        "a command covers every route of its verb and resource",
      ).toEqual(expected);

      expect(Object.keys(command.args ?? {}), "no positional argument").toEqual([]);
      const flags = command.flags ?? {};
      const pathFlags = routes.map((route) => pathFlagsForRoute(route, id));
      // On the Management API, `--project <name>` may give the project's id from the config
      // file: `--id` of the projects commands and `--project-id` of their sub-resources are optional.
      const fromConfig = (flag: string): boolean =>
        api === "management" &&
        (flag === "project-id" || (flag === "id" && id.endsWith(" projects")));
      for (const flag of new Set(pathFlags.flat())) {
        if (flag === "id") continue;
        expect(flags[flag], `--${flag} must exist`).toBeDefined();
        if (!fromConfig(flag)) {
          expect(flags[flag]?.required, `--${flag} must be a required flag`).toBe(true);
        }
      }
      const routesWithId = pathFlags.filter((set) => set.includes("id")).length;
      if (routesWithId > 0) {
        expect(flags.id, "--id must exist").toBeDefined();
        expect(flags.id?.required === true, "--id is required only when every route takes it").toBe(
          routesWithId === routes.length && !fromConfig("id"),
        );
      }

      const allowed = new Set([
        ...globalFlags,
        ...CLI_OWNED_FLAGS,
        ...flagsForCommand(spec, routes, id),
      ]);
      for (const [flag, definition] of Object.entries(flags)) {
        expect(
          allowed,
          `--${flag} is neither a parameter of a route of meili ${id} nor a CLI-owned flag`,
        ).toContain(flag);
        for (const alias of definition.aliases ?? []) {
          expect(allowed, `--${alias} is not an accepted alias of meili ${id}`).toContain(alias);
        }
      }

      const signatures = routes.map((route) =>
        [...new Set([...pathFlagsForRoute(route, id), ...flagsForRoute(spec, route, id)])]
          .sort()
          .join(" "),
      );
      expect(
        new Set(signatures).size,
        "each route must be reachable by a distinct set of flags",
      ).toBe(routes.length);
    });
  }
});

describe("commands that do not derive from a route", () => {
  const apiCommands = new Set([
    ...derived.meilisearch.keys(),
    ...(derived.management?.keys() ?? []),
  ]);
  for (const { id } of commands.filter(({ command }) => !hasRoutes(command))) {
    it(`meili ${id} is in the table of commands.md and takes neither the name of an API command nor a verb`, () => {
      expect(listedCommands).toContain(id);
      expect(apiCommands).not.toContain(id);
      expect(VERBS).not.toContain(id.split(" ")[0]);
    });
  }
  it("the table of commands.md lists only commands that exist", () => {
    const ids = commands.map(({ id }) => id);
    for (const listed of listedCommands)
      expect(ids, `meili ${listed} is listed but does not exist`).toContain(listed);
  });
});

describe("exceptions", () => {
  it("the table of commands.md is exactly the list of api-naming.ts", () => {
    const rows = tableRows(section(readDoc("docs/contract/commands.md"), "Exceptions")).map(
      ([route = "", command = "", reason = ""]) => ({
        route: codeSpans(route)[0] ?? route,
        command: command === "none" ? null : (codeSpans(command)[0] ?? command),
        reason,
      }),
    );
    expect(rows).toEqual(
      ROUTE_EXCEPTIONS.map(({ route, command, reason }) => ({ route, command, reason })),
    );
  });

  it("every exception matches a route of the documents", () => {
    const keys = documentedRoutes.map(routeKey);
    for (const exception of ROUTE_EXCEPTIONS) {
      if (specs.management === undefined && exception.route.includes("/api/v2/")) continue;
      expect(
        keys.some((key) => matchesRoutePattern(exception.route, key)),
        `${exception.route} matches no route of the documents`,
      ).toBe(true);
    }
  });
});
