#!/usr/bin/env node
/**
 * Sorts the commands of `oclif.manifest.json`.
 *
 * `oclif manifest` writes them in the order it globs `dist/commands/`, which is
 * the order of the filesystem: it differs between two machines, and between a
 * clean build and an incremental one. The committed file would then never match
 * the one CI regenerates, whatever the code says. Sorting makes it the same
 * everywhere, and makes a diff on it readable.
 */
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../oclif.manifest.json", import.meta.url);
const manifest = JSON.parse(readFileSync(path, "utf8"));
manifest.commands = Object.fromEntries(
  Object.entries(manifest.commands).sort(([left], [right]) => left.localeCompare(right)),
);
writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
