/**
 * Output contract: the only module that writes to stdout. See docs/contract/output.md.
 *
 * This file, errors.ts and config.ts implement the contract. They change only
 * through a contract pull request.
 */
import { styleText } from "node:util";

/** Text for a human when stdout is a terminal, compact JSON otherwise (docs/contract/output.md, "Format"). */
export interface OutputMode {
  human: boolean;
  color: boolean;
}

let mode: OutputMode = { human: false, color: false };

/** Set once per run, before anything is written: by `BaseCommand`, or by `bin/run.js` for an error outside a command. */
export function setOutputMode(
  options: { json: boolean; color: boolean },
  stdoutIsTTY = process.stdout.isTTY === true,
): void {
  const human = stdoutIsTTY && !options.json;
  mode = { human, color: human && options.color };
}

export function outputMode(): OutputMode {
  return mode;
}

/** `text` in a color or a weight, or as it is without colors. */
export function paint(style: Parameters<typeof styleText>[0], text: string): string {
  return mode.color ? styleText(style, text, { validateStream: false }) : text;
}

/** JSON, compact, or indented for a human when the command has no text of its own. Pure, so tests can snapshot it. */
export function formatData(value: unknown, pretty: boolean): string {
  return `${pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)}\n`;
}

/** Writes one result on stdout. Data only, nothing else, ever. */
export function writeData(value: unknown): void {
  process.stdout.write(formatData(value, mode.human));
}

/**
 * What a command shows a human: the status sentence before the data, the
 * data, and the next steps after it. Only the data goes to stdout.
 */
export interface HumanView {
  status?: string[];
  data?: string;
  next?: string[];
}

/** Writes a view, its parts one blank line apart. */
export function writeView({ status = [], data, next = [] }: HumanView): void {
  if (status.length > 0) {
    process.stderr.write(`${status.join("\n")}\n${data === undefined ? "" : "\n"}`);
  }
  if (data !== undefined) process.stdout.write(`${data}\n`);
  if (next.length > 0) {
    const gap = status.length > 0 || data !== undefined ? "\n" : "";
    process.stderr.write(`${gap}${next.join("\n")}\n`);
  }
}
