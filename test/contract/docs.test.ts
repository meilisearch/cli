/**
 * The paths, scripts, statics and commands that the guides cite exist. A
 * renamed file or helper that a doc still names fails here, not in a reader's
 * hands. Fenced code blocks are not checked, only inline code spans.
 */
import { existsSync, readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BaseCommand } from "../../src/lib/base-command.js";
import { PROJECT_ROOT } from "../helpers/run-command.js";
import { codeSpans, readDoc } from "./markdown.js";

const guides = ["CLAUDE.md", "README.md", "CONTRIBUTING.md"];
for await (const file of glob(".claude/skills/*/SKILL.md", { cwd: PROJECT_ROOT }))
  guides.push(file);
for await (const file of glob("docs/contract/*.md", { cwd: PROJECT_ROOT })) guides.push(file);

/**
 * Paths the docs name on purpose before they exist: the worked example of the
 * skill, and pieces that arrive with the first management command. When one of
 * them appears for real, remove it from this list.
 */
const PLANNED_PATHS = [
  "CHANGELOG.md",
  "src/commands/get/projects.ts",
  "src/commands/get/stats.ts",
  "src/lib/clients/management/generated/",
  "test/commands/get/__snapshots__/stats.test.ts.snap",
  "test/commands/get/stats.test.ts",
  "test/helpers/management-handlers.ts",
  "test/integration/management/",
  "test/integration/management/README.md",
  "test/integration/management/bootstrap/",
  "test/integration/meilisearch/get-stats.test.ts",
];
const PLANNED_SCRIPTS = ["gen:management"];

/** A span that is a path of this repository: a known top-level file or folder. */
const PATH_SPAN =
  /^(?:src|test|docs|scripts|bin|\.claude|\.github|\.changeset)\/[\w./@-]*$|^(?:CLAUDE|README|CONTRIBUTING|CHANGELOG)\.md$|^(?:package\.json|oclif\.manifest\.json|docker-compose\.yml)$/;
const PNPM_BUILTINS = new Set(["install", "link", "exec", "add", "remove", "dlx"]);

const scripts = Object.keys(
  (
    JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts,
);
const manifestIds = Object.keys(
  (
    JSON.parse(readFileSync(join(PROJECT_ROOT, "oclif.manifest.json"), "utf8")) as {
      commands: Record<string, unknown>;
    }
  ).commands,
).map((id) => id.replaceAll(":", " "));

describe("the guides cite things that exist", () => {
  for (const guide of guides) {
    const spans = codeSpans(readDoc(guide));

    it(`${guide}: every path exists, or is listed as planned`, () => {
      for (const span of spans) {
        if (!PATH_SPAN.test(span) || span.includes("<")) continue;
        const planned = PLANNED_PATHS.includes(span);
        expect(
          existsSync(join(PROJECT_ROOT, span)),
          planned ? `${span} exists now: remove it from PLANNED_PATHS` : `${span} does not exist`,
        ).toBe(!planned);
      }
    });

    it(`${guide}: every pnpm script exists`, () => {
      for (const span of spans) {
        const script = span.match(/^pnpm ([\w:-]+)/)?.[1];
        if (script === undefined || PNPM_BUILTINS.has(script)) continue;
        const planned = PLANNED_SCRIPTS.includes(script);
        expect(
          scripts.includes(script),
          planned
            ? `pnpm ${script} exists now: remove it from PLANNED_SCRIPTS`
            : `no script ${script}`,
        ).toBe(!planned);
      }
    });

    it(`${guide}: every BaseCommand member exists`, () => {
      for (const span of spans) {
        const member = span.match(/^BaseCommand\.(\w+)$/)?.[1];
        if (member === undefined) continue;
        expect(
          member in BaseCommand || member in BaseCommand.prototype,
          `BaseCommand.${member} does not exist`,
        ).toBe(true);
      }
    });
  }

  it("README.md: every command it shows exists, unless the line says it is not shipped", () => {
    for (const line of readDoc("README.md").split("\n")) {
      if (line.includes("not shipped")) continue;
      for (const span of codeSpans(line)) {
        const id = span.match(/^meili ([a-z-]+(?: [a-z-]+)?)/)?.[1];
        if (id === undefined || id.startsWith("-")) continue;
        expect(manifestIds, `README shows \`${span}\`, which is not a command`).toContain(id);
      }
    }
  });
});
