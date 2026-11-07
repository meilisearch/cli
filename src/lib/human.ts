/**
 * The text a command shows a human in a terminal (docs/contract/output.md,
 * "Format"). Pure: it returns text, and output.ts writes it. A value is never
 * cut, and a date or a duration stays as the API writes it.
 */
import { stripVTControlCharacters } from "node:util";
import type { EnqueuedTask, Task } from "meilisearch";
import type { Project } from "./clients/management/generated/types.gen.js";
import { describeError, isRecord } from "./errors.js";
import { paint } from "./output.js";

const width = (text: string): number => stripVTControlCharacters(text).length;
const padEnd = (text: string, size: number): string =>
  text + " ".repeat(Math.max(0, size - width(text)));
const columns = (): number => process.stdout.columns ?? 80;

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
export function fields(rows: [string, string][], indent = 2): string {
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  return rows
    .map(
      ([label, value]) =>
        `${" ".repeat(indent)}${padEnd(paint("dim", label), labelWidth + 2)}${value}`,
    )
    .join("\n");
}

/** A value that fits on one line: text, a number, a boolean, null, or an array of those. */
export function simpleValue(value: unknown): string | undefined {
  if (value === null) return paint("dim", "null");
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
  const entries = Object.entries(object);
  if (entries.length === 0) return [`${" ".repeat(indent)}${paint("dim", "empty")}`];
  const column = indent + Math.max(...entries.map(([key]) => key.length)) + 2;
  return entries.flatMap(([key, value]) => {
    const label = `${" ".repeat(indent)}${paint("dim", key)}`;
    const simple = simpleValue(value);
    if (simple !== undefined) {
      const [first = "", ...rest] = wrap(simple, columns() - column);
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
  running: "green",
  succeeded: "green",
  failed: "red",
  canceled: "red",
};

/** A status in green when it is done, red when it failed, yellow while it moves. */
export function status(value: string): string {
  return paint(STATUS_COLORS[value] ?? "yellow", value);
}

/** The status of a Cloud project, capitalized like the dashboard writes it: `Running`. */
export function projectStatus(value: string): string {
  return paint(STATUS_COLORS[value] ?? "yellow", value.charAt(0).toUpperCase() + value.slice(1));
}

const yesNo = (value: boolean): string => (value ? "yes" : "no");

/** A Cloud project in full: its name and status, a summary, then its fields. */
export function projectView(project: Project): string {
  const dot = paint("dim", " • ");
  const rows: [string, string][] = [
    ["URL", project.url ?? paint("dim", "none yet")],
    ["Project UID", project.projectUid],
    ["Read only", yesNo(project.readOnly)],
    ["Paused", yesNo(project.paused)],
    ["Created", project.createdAt],
    ["Terminated", project.terminatedAt ?? paint("dim", "no")],
  ];
  if (project.masterKey !== undefined) rows.push(["Master key", project.masterKey]);
  return [
    `${paint("bold", project.name)}  ${projectStatus(project.status)}`,
    [
      `Project ${project.id} of team ${project.teamId}`,
      `Meilisearch ${project.msVersion}`,
      `${project.workloadType} workload`,
    ].join(dot),
    [
      `Plan ${project.resource.plan} on resource ${project.resourceId}, region ${project.resource.regionId}`,
      ...(project.freeTrialEndsAt ? [`Free trial until ${project.freeTrialEndsAt}`] : []),
    ].join(dot),
    "",
    fields(rows),
  ].join("\n");
}

/** A task, as enqueued or as it ended: what it is, what it did, and when. */
export function taskView(task: EnqueuedTask | Task): string {
  const head = (uid: number): [string, string][] => [
    ["Task", String(uid)],
    ["Status", status(task.status)],
    ["Type", task.type],
    ["Index", task.indexUid ?? paint("dim", "none")],
  ];
  if (!("uid" in task)) return fields([...head(task.taskUid), ["Enqueued", task.enqueuedAt]]);
  const documents = (count: number | undefined) =>
    count === undefined ? undefined : `${count} documents`;
  const rows: [string, string | null | undefined][] = [
    ...head(task.uid),
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
export function taskOutcome(task: Task, succeeded: (task: Task) => string): string[] {
  if (task.status === "succeeded") {
    return [`${paint("green", "✓")} Task ${task.uid} succeeded: ${succeeded(task)}`];
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
