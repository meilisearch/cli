/**
 * docs/contract/commands.md against the code: the manifest, the command classes
 * and the global flags of BaseCommand.
 */
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { BaseCommand } from "../../src/lib/base-command.js";
import { PROJECT_ROOT } from "../helpers/run-command.js";
import { codeSpans, readDoc, section, tableRows } from "./markdown.js";

interface Manifest {
  commands: Record<
    string,
    {
      description?: string;
      examples?: Array<string | { command: string }>;
      flags: Record<string, { char?: string }>;
    }
  >;
}

const manifest = JSON.parse(
  readFileSync(join(PROJECT_ROOT, "oclif.manifest.json"), "utf8"),
) as Manifest;
const commandsDoc = readDoc("docs/contract/commands.md");

/** `meili index create <index> [--primary-key <field>]` becomes `index create`. */
function commandId(span: string): string | undefined {
  if (!span.startsWith("meili ")) return undefined;
  const words: string[] = [];
  for (const word of span.slice("meili ".length).split(/\s+/)) {
    if (word.startsWith("<") || word.startsWith("[") || word.startsWith("-")) break;
    words.push(word);
  }
  return words.length === 0 ? undefined : words.join(" ");
}

const contractIds = new Set<string>();
for (const row of tableRows(commandsDoc)) {
  for (const span of codeSpans(row[0] ?? "")) {
    const id = commandId(span);
    if (id !== undefined) contractIds.add(id);
  }
}

const manifestIds = Object.keys(manifest.commands).map((id) => id.replaceAll(":", " "));

describe("commands.md and oclif.manifest.json", () => {
  it("lists the commands of the contract", () => {
    expect(contractIds.size).toBeGreaterThan(50);
    expect(contractIds.has("health")).toBe(true);
    expect(contractIds.has("index create")).toBe(true);
  });

  it("every command in the manifest appears in commands.md", () => {
    for (const id of manifestIds) expect(contractIds, `${id} is not in commands.md`).toContain(id);
  });

  it.todo(
    "every `meili ...` command in commands.md exists in the manifest (enable when milestone 1 is complete)",
  );

  it.todo("`meili schema` output is a snapshot (enable when `meili schema` ships)");

  it("every command has a one-sentence description and at least two examples, one with --output json", () => {
    for (const [id, command] of Object.entries(manifest.commands)) {
      expect(command.description, `${id} has no description`).toBeTruthy();
      expect(
        command.description?.trim().endsWith("."),
        `${id} description must be a sentence`,
      ).toBe(true);
      const examples = (command.examples ?? []).map((example) =>
        typeof example === "string" ? example : example.command,
      );
      expect(examples.length, `${id} needs at least two examples`).toBeGreaterThanOrEqual(2);
      expect(
        examples.some((example) => example.includes("--output json")),
        `${id} needs an example with --output json`,
      ).toBe(true);
    }
  });
});

describe("static api", () => {
  it("every command class declares the API it uses", async () => {
    const files: string[] = [];
    for await (const file of glob("src/commands/**/*.ts", { cwd: PROJECT_ROOT })) files.push(file);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const module = (await import(join(PROJECT_ROOT, file))) as { default?: { api?: unknown } };
      expect(
        ["engine", "management", "none"],
        `${relative(PROJECT_ROOT, file)} must set static api`,
      ).toContain(module.default?.api);
    }
  });
});

describe("global flags", () => {
  const rows = tableRows(section(commandsDoc, "Global flags"));
  const documented = rows.map((row) => {
    const spans = codeSpans(row[0] ?? "");
    const parts = (spans[0] ?? "").split(",").map((part) => part.trim());
    const long = parts.find((part) => part.startsWith("--")) ?? "";
    const short = parts.find((part) => /^-[a-z]$/.test(part));
    return { name: long.slice(2).split(" ")[0] ?? "", char: short?.slice(1) };
  });

  it("BaseCommand.baseFlags matches the table, names, order and short characters", () => {
    const actual = Object.entries(BaseCommand.baseFlags).map(([name, flag]) => ({
      name,
      char: (flag as { char?: string }).char,
    }));
    expect(actual).toEqual(documented);
  });

  it("every command exposes the global flags", () => {
    for (const [id, command] of Object.entries(manifest.commands)) {
      for (const { name } of documented)
        expect(Object.keys(command.flags), `${id} lacks --${name}`).toContain(name);
    }
  });
});
