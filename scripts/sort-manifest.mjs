#!/usr/bin/env node
/**
 * Last step of `pnpm gen:manifest`: sorts the commands of oclif.manifest.json
 * by id. `oclif manifest` lists them in directory-scan order, which is not
 * stable from one machine to another, and CI fails when the committed file
 * differs from a fresh generation.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const path = join(dirname(fileURLToPath(import.meta.url)), "..", "oclif.manifest.json");
const manifest = JSON.parse(readFileSync(path, "utf8"));
manifest.commands = Object.fromEntries(
  Object.entries(manifest.commands).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(path, JSON.stringify(manifest, null, 2));
