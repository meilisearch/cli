/**
 * The terminal of the interactive commands, such as `meili teleport` (ADR 0015):
 * questions answered with the arrow keys, lines for the human, and one status
 * line that rewrites itself. Everything goes to stderr: stdout stays for data.
 */
import { input, password, select } from "@inquirer/prompts";

/** Where the questions are drawn. A function: tests replace `process.stderr.write`. */
const context = () => ({ output: process.stderr });

/** One answer out of a list, picked with the arrow keys. */
export function choose<T>(message: string, choices: Array<{ name: string; value: T }>): Promise<T> {
  return select({ message, choices, pageSize: 15 }, context());
}

/** A line of text, `default` when the human presses Enter. */
export function ask(
  message: string,
  options: { default?: string; validate?: (value: string) => string | true } = {},
): Promise<string> {
  return input({ message, ...options }, context());
}

/** A line of text that is never echoed. */
export function askSecret(message: string): Promise<string> {
  return password({ message, mask: true }, context());
}

/** True while the status line is on screen and the cursor sits at its end. */
let statusOpen = false;

/** One line for the human. Ends the status line first. */
export function say(line = ""): void {
  endStatus();
  process.stderr.write(`${line}\n`);
}

/** Replaces the status line with `text`. */
export function status(text: string): void {
  process.stderr.write(`\r\x1b[2K${text}`);
  statusOpen = true;
}

/** Leaves the status line on screen and moves to the next line. */
export function endStatus(): void {
  if (!statusOpen) return;
  process.stderr.write("\n");
  statusOpen = false;
}

const BAR_WIDTH = 30;

/** `[########--------------]  27%`, for a fraction between 0 and 1. */
export function bar(fraction: number): string {
  const filled = Math.round(fraction * BAR_WIDTH);
  return `[${"#".repeat(filled)}${"-".repeat(BAR_WIDTH - filled)}] ${String(Math.floor(fraction * 100)).padStart(3)}%`;
}

/** `1m12s`, `45s`: how long a wait has lasted. */
export function elapsed(since: number): string {
  const seconds = Math.floor((Date.now() - since) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}
