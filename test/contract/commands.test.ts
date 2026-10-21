/**
 * What every command must have, whatever its API: a description, examples, a
 * declared API, the global flags, and `--yes` when its verb is `delete`. The
 * route-derived names are checked in api.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import Schema from "../../src/commands/schema.js";
import { BaseCommand } from "../../src/lib/base-command.js";
import { PROJECT_ROOT, runCommand } from "../helpers/run-command.js";
import { codeSpans, readDoc, section, tableRows } from "./markdown.js";

interface ManifestFlag {
  type: "boolean" | "option";
  char?: string;
  description?: string;
  helpValue?: string;
  options?: string[];
  hidden?: boolean;
}

interface Manifest {
  commands: Record<
    string,
    {
      description?: string;
      examples?: Array<string | { command: string }>;
      flags: Record<string, ManifestFlag>;
    }
  >;
}

const manifest = JSON.parse(
  readFileSync(join(PROJECT_ROOT, "oclif.manifest.json"), "utf8"),
) as Manifest;
const commandsDoc = readDoc("docs/contract/commands.md");

describe("oclif.manifest.json", () => {
  it("`meili schema` is a snapshot, the index and every command in full, so a renamed command or flag is visible in review", async () => {
    const result = await runCommand(Schema, ["--output", "json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const index = JSON.parse(result.stdout) as { commands: Array<{ id: string }> };
    const commands: unknown[] = [];
    for (const { id } of index.commands) {
      const detail = await runCommand(Schema, ["--command", id, "--output", "json"]);
      expect(detail.exitCode, `meili schema --command "${id}"`).toBe(0);
      commands.push(JSON.parse(detail.stdout));
    }
    expect({ index, commands }).toMatchSnapshot();
  });

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

  it("every flag has a one-sentence description, and every flag with a value documents it", () => {
    for (const [id, command] of Object.entries(manifest.commands)) {
      for (const [name, flag] of Object.entries(command.flags)) {
        if (flag.hidden === true) continue;
        expect(
          flag.description?.trim().endsWith("."),
          `${id} --${name} needs a description that is a sentence`,
        ).toBe(true);
        if (flag.type === "option") {
          expect(
            flag.helpValue !== undefined || (flag.options?.length ?? 0) > 0,
            `${id} --${name} needs a helpValue or options`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("every command has a test file", () => {
  it("test/commands/ mirrors src/commands/", async () => {
    for await (const file of glob("src/commands/**/*.ts", { cwd: PROJECT_ROOT })) {
      const test = file.replace(/^src\//, "test/").replace(/\.ts$/, ".test.ts");
      expect(existsSync(join(PROJECT_ROOT, test)), `${file} needs ${test}`).toBe(true);
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
        ["meilisearch", "management", "none"],
        `${relative(PROJECT_ROOT, file)} must set static api`,
      ).toContain(module.default?.api);
    }
  });
});

describe("delete commands require --yes (ADR 0007)", () => {
  it("every command of the verb delete declares it, and no other command does", async () => {
    for await (const file of glob("src/commands/**/*.ts", { cwd: PROJECT_ROOT })) {
      const module = (await import(join(PROJECT_ROOT, file))) as {
        default?: { flags?: Record<string, { required?: boolean }> };
      };
      expect(
        module.default?.flags?.yes?.required === true,
        `${file}: --yes is required on the commands of the verb delete, and only there`,
      ).toBe(file.startsWith("src/commands/delete/"));
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
      for (const { name } of documented) {
        expect(Object.keys(command.flags), `${id} lacks --${name}`).toContain(name);
      }
    }
  });

  it("the connection flags are on the commands that talk to a project, and on no other", async () => {
    const connection = Object.keys(BaseCommand.connectionFlags);
    for await (const file of glob("src/commands/**/*.ts", { cwd: PROJECT_ROOT })) {
      const id = file.slice("src/commands/".length, -".ts".length).replaceAll("/", ":");
      const { default: command } = (await import(join(PROJECT_ROOT, file))) as {
        default: { api?: unknown };
      };
      const flags = Object.keys(manifest.commands[id]?.flags ?? {});
      // `config add` writes a project rather than connecting to one: it declares its own.
      const connects = command.api === "meilisearch" || id === "config:add";
      // `--project-url` is the unambiguous one: `config remove --project` names an
      // entry of the file, not a connection.
      expect(flags.includes("project-url"), `${id} and --project-url`).toBe(connects);
      if (connects) {
        for (const name of connection) expect(flags, `${id} lacks --${name}`).toContain(name);
      }
    }
  });
});
