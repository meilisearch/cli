/**
 * The text a command shows a human in a terminal (docs/contract/output.md,
 * "Format"). Pure: it returns text, and output.ts writes it. A value is never
 * cut, and a date or a duration stays as the API writes it.
 */
import { stripVTControlCharacters } from "node:util";
import type { EnqueuedTask, Key, Task } from "meilisearch";
import type { Project, Team } from "./clients/management/generated/types.gen.js";
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

/** One `label  value` per line, the labels in grey and the values aligned. */
export function fields(rows: [string, string][]): string {
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  return rows
    .map(([label, value]) => `  ${padEnd(paint("dim", label), labelWidth + 2)}${value}`)
    .join("\n");
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
  let line = "";
  for (const word of text.split(" ")) {
    if (line !== "" && line.length + 1 + word.length > size) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  return [...lines, line];
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

const yesNo = (value: boolean): string => (value ? "yes" : "no");

/** A Cloud project in full: its name and status, a summary, then every field. */
export function projectView(project: Project): string {
  const dot = paint("dim", " • ");
  const rows: [string, string][] = [
    ["URL", project.url ?? paint("dim", "none yet")],
    ["Project UID", project.projectUid],
    ["Read only", yesNo(project.readOnly)],
    ["Paused", yesNo(project.paused)],
    ["Created", project.createdAt],
    ["Terminated", project.terminatedAt ?? paint("dim", "no")],
    ["Free trial ends", project.freeTrialEndsAt ?? paint("dim", "no")],
  ];
  if (project.masterKey !== undefined) rows.push(["Master key", project.masterKey]);
  return [
    `${paint("bold", project.name)}  ${projectStatus(project.status)}`,
    [
      `Project ${project.id} of team ${project.teamId}`,
      `Meilisearch ${project.msVersion}`,
      `${project.workloadType} workload`,
    ].join(dot),
    `Plan ${project.resource.displayName ?? project.resource.plan} on resource ${project.resourceId}, region ${project.resource.regionId}`,
    "",
    fields(rows),
    `  ${paint("dim", "Resource")}`,
    ...objectLines(project.resource, 4),
  ].join("\n");
}

/** A task, as enqueued or as it ended: what it is, what it did, and when. */
export function taskView(task: EnqueuedTask | Task): string {
  const head: [string, string][] = [
    ["Task", String("uid" in task ? task.uid : task.taskUid)],
    ["Status", status(task.status)],
    ["Type", task.type],
    ["Index", task.indexUid ?? paint("dim", "none")],
  ];
  if (!("uid" in task)) return fields([...head, ["Enqueued", task.enqueuedAt]]);
  const documents = (count: number | undefined) =>
    count === undefined ? undefined : `${count} documents`;
  const rows: [string, string | null | undefined][] = [
    ...head,
    ["Received", documents(task.details?.receivedDocuments)],
    ["Indexed", documents(task.details?.indexedDocuments)],
    ["Deleted", documents(task.details?.deletedDocuments)],
    ["Duration", task.duration],
    ["Enqueued", task.enqueuedAt],
    ["Started", task.startedAt],
    ["Finished", task.finishedAt],
  ];
  return fields(rows.filter((row): row is [string, string] => typeof row[1] === "string"));
}

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

/** What a key may do, on which indexes, until when. */
export const keySummary = (key: Key): string =>
  summaryLine(
    `Actions ${key.actions.join(", ")}`,
    `Indexes ${key.indexes.join(", ")}`,
    `Expires ${key.expiresAt ?? "never"}`,
  );

/** Where a team belongs. */
export const teamSummary = (team: Team): string =>
  `Team ${team.id} of organization ${team.organizationId}`;
