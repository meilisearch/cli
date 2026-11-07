/**
 * The text a command shows a human in a terminal (docs/contract/output.md,
 * "Format"). Pure: it returns text, and output.ts writes it. A value is never
 * cut, and a date or a duration stays as the API writes it.
 */
import { stripVTControlCharacters } from "node:util";
import type { Task } from "meilisearch";
import type { Project } from "./clients/management/generated/types.gen.js";
import { describeError, isRecord } from "./errors.js";
import { type HumanView, paint } from "./output.js";

const width = (text: string): number => stripVTControlCharacters(text).length;
const padEnd = (text: string, size: number): string =>
  text + " ".repeat(Math.max(0, size - width(text)));
/** The width of the terminal, 80 when it does not say (0 or undefined). */
const columns = (): number => process.stdout.columns || 80;

/** Columns two spaces apart, under a bold header. */
export function table(header: string[], rows: string[][]): string {
  const widths = header.map((title, column) =>
    Math.max(width(title), ...rows.map((row) => width(row[column] ?? ""))),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, column) =>
        column === cells.length - 1 ? cell : padEnd(cell, widths[column] ?? 0),
      )
      .join("  ");
  return [paint("bold", line(header)), ...rows.map(line)].join("\n");
}

/** A value that fits on one line: text, a number, a boolean, null, or an array of those. */
export function simpleValue(value: unknown): string | undefined {
  if (value === null) return paint("dim", "null");
  if (value === "") return paint("dim", '""');
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) && value.every((item) => item === null || typeof item !== "object")) {
    return value.length === 0 ? paint("dim", "empty") : value.join(", ");
  }
  return undefined;
}

/** The words of `text` in lines of at most `size` characters. A longer word gets its own line. */
function wrap(text: string, size: number): string[] {
  const lines: string[] = [];
  // Undefined until the first word: an empty word, from a leading space, is kept.
  let line: string | undefined;
  for (const word of text.split(" ")) {
    if (line !== undefined && line.length + 1 + word.length > size) {
      lines.push(line);
      line = word;
    } else {
      line = line === undefined ? word : `${line} ${word}`;
    }
  }
  return [...lines, line ?? ""];
}

/**
 * An object in full, one attribute per line. Long text wraps under its value,
 * an object or an array of objects goes below its label, indented.
 */
export function objectLines(object: Record<string, unknown>, indent = 2): string[] {
  // An undefined attribute is not in the JSON either.
  const entries = Object.entries(object).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return [`${" ".repeat(indent)}${paint("dim", "empty")}`];
  const column = indent + Math.max(...entries.map(([key]) => key.length)) + 2;
  const size = Math.max(columns() - column, 20);
  return entries.flatMap(([key, value]) => {
    const label = `${" ".repeat(indent)}${paint("dim", key)}`;
    const simple = simpleValue(value);
    if (simple !== undefined) {
      const [first = "", ...rest] = simple.split("\n").flatMap((line) => wrap(line, size));
      return [padEnd(label, column) + first, ...rest.map((line) => " ".repeat(column) + line)];
    }
    if (isRecord(value)) return [label, ...objectLines(value, indent + 2)];
    return [label, ...(value as unknown[]).flatMap((item) => itemLines(item, indent + 2))];
  });
}

/** One item of an array that holds objects: `- ` then the item. */
function itemLines(item: unknown, indent: number): string[] {
  const dash = `${" ".repeat(indent)}${paint("dim", "-")} `;
  if (!isRecord(item)) return [`${dash}${simpleValue(item) ?? JSON.stringify(item)}`];
  const [first = "", ...rest] = objectLines(item, indent + 2);
  return [dash + first.slice(indent + 2), ...rest];
}

const STATUS_COLORS: Record<string, "green" | "red"> = {
  available: "green",
  running: "green",
  succeeded: "green",
  failed: "red",
  canceled: "red",
};

/** A status in green when it is done, red when it failed, yellow while it moves. */
export function status(value: string, label = value): string {
  return paint(STATUS_COLORS[value] ?? "yellow", label);
}

/** The status of a Cloud project, capitalized like the dashboard writes it: `Running`. */
export function projectStatus(value: string): string {
  return status(value, value.charAt(0).toUpperCase() + value.slice(1));
}

/** What a project is, above its fields: its name and status, its team and version, its plan. */
export function projectSummary(project: Project): string[] {
  return [
    `${paint("bold", project.name)}  ${projectStatus(project.status)}`,
    summaryLine(
      `Project ${project.id} of team ${project.teamId}`,
      `Meilisearch ${project.msVersion}`,
    ),
    `Plan ${project.resource.displayName ?? project.resource.plan} on resource ${project.resourceId}, region ${project.resource.regionId}`,
  ];
}

/** A project with its resource as its display name alone, under `resourceId`, as `project add` and `project update` show it. */
export function projectBrief(project: Project): string {
  const { resource, ...rest } = project;
  const entries = Object.entries(rest).flatMap(([key, value]) =>
    key === "resourceId"
      ? [
          [key, value],
          ["resource", resource.displayName],
        ]
      : [[key, value]],
  );
  return objectLines(Object.fromEntries(entries)).join("\n");
}

/** What a human reads after a project shown in brief: how to see it in full. */
export const projectBriefNext = (id: number): string =>
  `${paint("dim", "Simplified view. See the project in full:")} meili project view --id ${id}${paint("dim", ". See every field:")} --json${paint("dim", ".")}`;

/** The status sentence of a task that ended: ✓ and what it did, or ✗ and its error. */
export function taskOutcome(task: Task, succeeded?: (task: Task) => string): string[] {
  if (task.status === "succeeded") {
    const what = succeeded === undefined ? "." : `: ${succeeded(task)}`;
    return [`${paint("green", "✓")} Task ${task.uid} succeeded${what}`];
  }
  if (task.error == null) return [`${paint("red", "✗")} Task ${task.uid} was ${task.status}.`];
  return describeError(paint("red", "✗"), {
    ...task.error,
    message: `Task ${task.uid} failed: ${task.error.message}`,
  });
}

/** A command line to paste, each argument quoted when a shell would split it. */
export function commandLine(args: string[]): string {
  return ["meili", ...args]
    .map((arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`))
    .join(" ");
}

/** `teamId` as a table header: `TEAM_ID`. */
const header = (name: string): string =>
  name.replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

/** The attributes a list holds, in their order, and the ones a table shows: simple in every row, at most `max`. */
export function tableColumns(
  rows: Record<string, unknown>[],
  max: number,
): { all: string[]; shown: string[] } {
  const all = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const shown: string[] = [];
  for (const name of all) {
    if (shown.length === max) break;
    if (rows.every((row) => row[name] === undefined || simpleValue(row[name]) !== undefined)) {
      shown.push(name);
    }
  }
  return { all, shown };
}

/** The key of the list in an API body, when it holds one: `results`, `hits` or `facetHits`. */
function listKey(data: Record<string, unknown>): string | undefined {
  return ["results", "hits", "facetHits"].find(
    (key) => Array.isArray(data[key]) && (data[key] as unknown[]).every(isRecord),
  );
}

/**
 * The text of a command that has none of its own: a table for a list, every
 * attribute for an object. A table that leaves attributes out says so.
 */
export function defaultView(data: unknown): HumanView {
  if (Array.isArray(data) && data.every(isRecord)) return listView(data, {});
  if (!isRecord(data)) return { data: simpleValue(data) ?? JSON.stringify(data) };
  const key = listKey(data);
  if (key === undefined) return { data: objectLines(data, 0).join("\n") };
  const { [key]: rows, ...envelope } = data;
  return listView(rows as Record<string, unknown>[], envelope);
}

function listView(rows: Record<string, unknown>[], envelope: Record<string, unknown>): HumanView {
  const { total, totalHits, estimatedTotalHits, ...rest } = envelope;
  const count = total ?? totalHits ?? estimatedTotalHits;
  const about = count === estimatedTotalHits && count !== undefined ? "about " : "";
  const summary = [
    paint("bold", `Showing ${rows.length}${count === undefined ? "" : ` of ${about}${count}`}`),
  ];
  const others = Object.entries(rest).map(([name, value]) => [name, simpleValue(value)] as const);
  const simple = others.filter(([, value]) => value !== undefined);
  if (simple.length > 0) {
    summary.push(paint("dim", simple.map(([name, value]) => `${name} ${value}`).join(" • ")));
  }
  if (rows.length === 0) return { status: summary };
  const { all, shown } = tableColumns(rows, 6);
  const next =
    shown.length < all.length || simple.length < others.length
      ? [
          `${paint("dim", `Simplified view: ${shown.length} of ${all.length} attributes. See every field:`)} --json${paint("dim", ".")}`,
        ]
      : [];
  return {
    status: summary,
    data: table(
      shown.map(header),
      rows.map((row) =>
        shown.map((name) => {
          const value = row[name];
          if (value === undefined) return "";
          return name === "status" && typeof value === "string"
            ? status(value)
            : (simpleValue(value) ?? "");
        }),
      ),
    ),
    next,
  };
}

/** One item: a summary of it on the status line, then every attribute. */
export function itemView(summary: string[], item: object): HumanView {
  return { status: summary, data: objectLines(item as Record<string, unknown>).join("\n") };
}

/** Parts of a summary line, grey dots between them. */
export const summaryLine = (...parts: string[]): string => parts.join(paint("dim", " • "));

/** A sentence about what a command did: a green ✓ before it. */
export const done = (sentence: string): string => `${paint("green", "✓")} ${sentence}`;
