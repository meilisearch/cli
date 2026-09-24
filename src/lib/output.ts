/**
 * Output contract: the only module that writes to stdout. See docs/contract/output.md.
 *
 * This file, errors.ts and config.ts implement the contract. They change only
 * through a contract pull request.
 */
import { MeiliCliError } from "./errors.js";

export const OUTPUT_MODES = ["json", "ndjson", "table"] as const;

export type OutputMode = (typeof OUTPUT_MODES)[number];

export function isOutputMode(value: unknown): value is OutputMode {
  return typeof value === "string" && (OUTPUT_MODES as readonly string[]).includes(value);
}

export interface ResolveOutputModeOptions {
  /** Value of `--output`, already validated by the flag parser. */
  flag: string | undefined;
  /** True when `--json` is present. */
  json: boolean;
  env: Readonly<Record<string, string | undefined>>;
  stdoutIsTTY: boolean;
  /** Ignore an invalid MEILI_OUTPUT instead of failing. Used by the fatal error handler. */
  lenient?: boolean;
}

/**
 * `--output` wins, then `--json`, then `MEILI_OUTPUT`, then the TTY rule:
 * `json` when stdout is not a TTY, `table` when it is.
 */
export function resolveOutputMode(options: ResolveOutputModeOptions): OutputMode {
  if (isOutputMode(options.flag)) return options.flag;
  if (options.json) return "json";
  const fromEnv = options.env.MEILI_OUTPUT;
  if (fromEnv !== undefined && fromEnv !== "") {
    if (isOutputMode(fromEnv)) return fromEnv;
    if (options.lenient !== true) {
      throw new MeiliCliError(
        "cli_usage",
        `MEILI_OUTPUT must be one of ${OUTPUT_MODES.join(", ")}, got \`${fromEnv}\`.`,
      );
    }
  }
  return options.stdoutIsTTY ? "table" : "json";
}

/**
 * Best-effort mode for errors raised before the flags were parsed: scans the raw
 * argv for `--output`, `-o` and `--json`, then applies the usual rules.
 */
export function resolveOutputModeFromArgv(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  stdoutIsTTY: boolean,
): OutputMode {
  let flag: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output" || arg === "-o") flag = argv[index + 1];
    else if (arg?.startsWith("--output=")) flag = arg.slice("--output=".length);
    else if (arg?.startsWith("-o=")) flag = arg.slice("-o=".length);
  }
  return resolveOutputMode({
    flag,
    json: argv.includes("--json"),
    env,
    stdoutIsTTY,
    lenient: true,
  });
}

export interface UseColorOptions {
  streamIsTTY: boolean;
  noColorFlag: boolean;
  env: Readonly<Record<string, string | undefined>>;
}

/** Colors appear only when the stream is a TTY, `--no-color` is absent and `NO_COLOR` is unset. */
export function useColor(options: UseColorOptions): boolean {
  return options.streamIsTTY && !options.noColorFlag && options.env.NO_COLOR === undefined;
}

export interface WriteDataOptions {
  mode: OutputMode;
  stdoutIsTTY: boolean;
  /** Only list commands support `ndjson`. Defaults to false. */
  supportsNdjson?: boolean;
  color: boolean;
}

/** Formats a value for stdout in the selected mode. Pure, so tests can snapshot it. */
export function formatData(value: unknown, options: WriteDataOptions): string {
  switch (options.mode) {
    case "json":
      return `${options.stdoutIsTTY ? JSON.stringify(value, null, 2) : JSON.stringify(value)}\n`;
    case "ndjson": {
      if (options.supportsNdjson !== true) {
        throw new MeiliCliError(
          "cli_usage",
          "The `ndjson` output mode is only available on list commands. Use `--output json`.",
        );
      }
      const items = Array.isArray(value) ? value : [value];
      return items.map((item) => `${JSON.stringify(item)}\n`).join("");
    }
    case "table":
      return renderTable(value, options.color);
  }
}

/** Writes one result on stdout. Data only, nothing else, ever. */
export function writeData(value: unknown, options: WriteDataOptions): void {
  process.stdout.write(formatData(value, options));
}

/** Writes one item of an `ndjson` stream. Used by `--all` on list commands. */
export function writeNdjsonItem(item: unknown): void {
  process.stdout.write(`${JSON.stringify(item)}\n`);
}

// Table mode is for humans and is not a contract. Keep it small.

const ESC = String.fromCodePoint(0x1b);
const BOLD_ON = `${ESC}[1m`;
const BOLD_OFF = `${ESC}[22m`;

function renderTable(value: unknown, color: boolean): string {
  if (Array.isArray(value)) return renderRows(value, color);
  if (isRecord(value)) {
    const rows = Object.entries(value).map(([key, cell]) => [key, cellText(cell)]);
    return `${alignColumns(rows).join("\n")}\n`;
  }
  return `${cellText(value)}\n`;
}

function renderRows(items: unknown[], color: boolean): string {
  if (items.length === 0) return "";
  if (!items.every(isRecord)) {
    return `${items.map(cellText).join("\n")}\n`;
  }
  const columns: string[] = [];
  for (const item of items) {
    for (const key of Object.keys(item)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const header = columns.map((column) => column.toUpperCase());
  const body = items.map((item) => columns.map((column) => cellText(item[column])));
  const [headerLine = "", ...bodyLines] = alignColumns([header, ...body]);
  const styledHeader = color ? `${BOLD_ON}${headerLine}${BOLD_OFF}` : headerLine;
  return `${[styledHeader, ...bodyLines].join("\n")}\n`;
}

function alignColumns(rows: string[][]): string[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }
  return rows.map((row) =>
    row
      .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
      .join("  ")
      .trimEnd(),
  );
}

function cellText(cell: unknown): string {
  if (cell === undefined) return "";
  if (cell === null) return "null";
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" || typeof cell === "boolean" || typeof cell === "bigint") {
    return String(cell);
  }
  return JSON.stringify(cell);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
