/**
 * The terminal of the interactive commands, such as `meili teleport` (ADR 0015):
 * questions answered with the arrow keys, lines for the human, and one status
 * line that rewrites itself. Everything goes to stderr: stdout stays for data.
 *
 * Every question has a `prompt` id, and every option may have an `id`: the
 * analytics record them (ADR 0016), never the text of a free answer. A renamed
 * id breaks the funnels that use it.
 */
import { input, password, select } from "@inquirer/prompts";
import { track } from "./analytics.js";

/** Where the questions are drawn. A function: tests replace `process.stderr.write`. */
const context = () => ({ output: process.stderr });

/** True for the error of a question the human left with Ctrl-C. */
export function isPromptExit(error: unknown): boolean {
  return error instanceof Error && error.name === "ExitPromptError";
}

/** The answer to the question `prompt`, recorded as answered or as left. */
async function answer<T>(
  prompt: string,
  question: Promise<T>,
  choice: (value: T) => string | undefined,
): Promise<T> {
  try {
    const value = await question;
    track("cli_prompt_answered", { prompt, choice: choice(value) });
    return value;
  } catch (error) {
    if (isPromptExit(error)) track("cli_prompt_aborted", { prompt });
    throw error;
  }
}

/** One answer out of a list, picked with the arrow keys. */
export function choose<T>(
  prompt: string,
  message: string,
  choices: Array<{ name: string; value: T; id?: string }>,
): Promise<T> {
  return answer(
    prompt,
    select({ message, choices, pageSize: 15 }, context()),
    (value) => choices.find((each) => each.value === value)?.id,
  );
}

/** A line of text, `default` when the human presses Enter. */
export function ask(
  prompt: string,
  message: string,
  options: { default?: string; validate?: (value: string) => string | true } = {},
): Promise<string> {
  return answer(prompt, input({ message, ...options }, context()), (value) =>
    value === options.default ? "default" : "custom",
  );
}

/** A line of text that is never echoed. */
export function askSecret(prompt: string, message: string): Promise<string> {
  return answer(prompt, password({ message, mask: true }, context()), (value) =>
    value === "" ? "empty" : "custom",
  );
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
