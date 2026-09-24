#!/usr/bin/env node
/**
 * Prints every command the OpenAPI documents derive, with its routes and whether
 * it exists. Run `pnpm openapi` first, then `pnpm api:coverage`.
 */
import { existsSync, readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { commandIdFor, commandsOf, eachRoute, routeKey } from "../dist/lib/api-naming.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadSpec(api) {
  const path = join(ROOT, "openapi", `${api}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

const specs = { meilisearch: loadSpec("meilisearch"), management: loadSpec("management") };
if (!specs.meilisearch) {
  console.error("openapi/meilisearch.json is missing. Run `pnpm openapi` first.");
  process.exit(1);
}

/** Command id, `get indexes`, to the routes its class declares. */
const implemented = new Map();
for (const file of await Array.fromAsync(glob("dist/commands/**/*.js", { cwd: ROOT }))) {
  const command = (await import(pathToFileURL(join(ROOT, file)).href)).default;
  if (!Array.isArray(command?.routes) || command.routes.length === 0) continue;
  const id = file.slice("dist/commands/".length, -".js".length).split("/").join(" ");
  implemented.set(id, new Set(command.routes));
}

for (const [api, spec] of Object.entries(specs)) {
  if (!spec) {
    console.log(`\n${api}: openapi/${api}.json not downloaded\n`);
    continue;
  }
  const commands = commandsOf(spec);
  let done = 0;
  const lines = [];
  for (const [id, routes] of commands) {
    const keys = routes.map(routeKey);
    const declared = implemented.get(id);
    const exists = declared !== undefined && keys.every((key) => declared.has(key));
    if (exists) done += 1;
    lines.push(`[${exists ? "x" : " "}] meili ${id.padEnd(24)} ${keys.join(", ")}`);
  }
  const skipped = eachRoute(spec).filter((route) => commandIdFor(route) === null).length;
  console.log(
    `\n${api}: ${done} of ${commands.size} commands exist, ${skipped} routes declared without command\n`,
  );
  console.log(lines.join("\n"));
}
