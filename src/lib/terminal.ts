/**
 * The terminal of the interactive commands, such as `meili teleport` (ADR 0015):
 * questions answered with the arrow keys, lines for the human, and a status
 * block that animates while the command waits. Everything goes to stderr:
 * stdout stays for data. Colors follow `NO_COLOR` and `FORCE_COLOR`.
 *
 * Every question has a `prompt` id, and every option may have an `id`: the
 * analytics record them (ADR 0016), never the text of a free answer. A renamed
 * id breaks the funnels that use it.
 */
import { stripVTControlCharacters, styleText } from "node:util";
import { input, password, Separator, select } from "@inquirer/prompts";
import { track } from "./analytics.js";

/** Where the questions are drawn. A function: tests replace `process.stderr.write`. The answer becomes a `step` line. */
const context = () => ({ output: process.stderr, clearPromptOnDone: true });

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

/** The left margin of every line, questions included. */
const MARGIN = "  ";

/** The look of the questions: inquirer's, in the margin. */
const theme = () => ({
  prefix: `${MARGIN}${paint("blue", "?")}`,
  icon: { cursor: "❯" },
  style: {
    error: (text: string) => `${MARGIN}${paint("red", `> ${text}`)}`,
    // A choice is drawn `❯ <name>`, and `choose` starts every name with the margin: the cursor moves into it.
    highlight: (text: string) =>
      paint("cyan", `${MARGIN}${text.slice(0, 2)}${text.slice(2 + MARGIN.length)}`),
    keysHelpTip: (keys: [string, string][]) =>
      MARGIN +
      keys
        .map(([key, action]) => `${paint("bold", key)} ${paint("dim", action)}`)
        .join(paint("dim", " • ")),
  },
});

type Choice<T> = { name: string; value: T; id?: string };

/** One answer out of a list, picked with the arrow keys. A `heading` starts a group of answers. */
export function choose<T>(
  prompt: string,
  message: string,
  choices: Array<Choice<T> | Separator>,
): Promise<T> {
  clearStatus();
  return answer(
    prompt,
    select(
      {
        message,
        choices: choices.map((choice) =>
          Separator.isSeparator(choice) ? choice : { ...choice, name: `${MARGIN}${choice.name}` },
        ),
        pageSize: 15,
        theme: theme(),
      },
      context(),
    ),
    (value) =>
      choices.find(
        (each): each is Choice<T> => !Separator.isSeparator(each) && each.value === value,
      )?.id,
  );
}

/** The title of a group of answers of `choose`, which the arrow keys skip. Its answers are indented. */
export function heading(title: string): Separator {
  return new Separator(`${MARGIN} ${paint("bold", title)}`);
}

/** A line of text, `default` when the human presses Enter. */
export function ask(
  prompt: string,
  message: string,
  options: { default?: string; validate?: (value: string) => string | true } = {},
): Promise<string> {
  clearStatus();
  return answer(prompt, input({ message, ...options, theme: theme() }, context()), (value) =>
    value === options.default ? "default" : "custom",
  );
}

/** A line of text that is never echoed. */
export function askSecret(prompt: string, message: string): Promise<string> {
  clearStatus();
  return answer(prompt, password({ message, mask: true, theme: theme() }, context()), (value) =>
    value === "" ? "empty" : "custom",
  );
}

/** `text` in `style`, when stderr shows colors. */
export function paint(style: Parameters<typeof styleText>[0], text: string): string {
  return styleText(style, text, { stream: process.stderr });
}

const LABEL_WIDTH = 12;

/** One line for the human, in the margin. Ends the status block first, and leaves it on screen. */
export function say(line = ""): void {
  endStatus();
  process.stderr.write(line === "" ? "\n" : `${MARGIN}${line}\n`);
}

/** A line under the text of a `✔` or `✖` line. */
export function detail(line: string): void {
  say(`  ${line}`);
}

/** `  ✔ Region      Frankfurt  2s`: a step done, with how long it took since `since`. */
export function step(label: string, text: string, since?: number): void {
  clearStatus();
  const took = since === undefined ? "" : `  ${paint("dim", elapsed(since))}`;
  say(`${paint("green", "✔")} ${paint("bold", label.padEnd(LABEL_WIDTH))}${text}${took}`);
}

/** `  ✖ text`, for what went wrong. */
export function problem(text: string): void {
  say(`${paint("red", "✖")} ${text}`);
}

/** `    Project settings  https://…`: a label and a value to copy or open. */
export function field(label: string, value: string): void {
  detail(`${label.padEnd(18)}${paint("cyan", value)}`);
}

const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

/** What the status block shows, the rows it covers on screen, and the timer that animates it. */
let render: (() => string) | undefined;
let drawn = 0;
let frame = 0;
let timer: NodeJS.Timeout | undefined;

/**
 * Shows `text()` after a spinner, and draws it again every 80 ms, so a wait
 * moves even between two polls. `text()` may return several lines.
 */
export function status(text: () => string): void {
  render = text;
  timer ??= setInterval(() => {
    frame = (frame + 1) % FRAMES.length;
    draw();
  }, 80).unref();
  draw();
}

function draw(): void {
  if (render === undefined) return;
  const [first, ...rest] = render().split("\n");
  const lines = [
    `${MARGIN}${paint("cyan", FRAMES[frame] as string)} ${first}`,
    ...rest.map((line) => `${MARGIN}  ${line}`),
  ];
  process.stderr.write(`${cursorToBlock()}${lines.join("\n")}`);
  // A line wider than the terminal takes several rows.
  const columns = process.stderr.columns || 80;
  drawn = lines.reduce(
    (rows, line) => rows + Math.max(1, Math.ceil(stripVTControlCharacters(line).length / columns)),
    0,
  );
}

/** Moves to the first line of the status block, and erases it. */
function cursorToBlock(): string {
  return `${drawn > 1 ? `\x1b[${drawn - 1}A` : ""}\r\x1b[J`;
}

/** Stops the status block, and writes `tail` when it is on screen. */
function closeStatus(tail: string): void {
  clearInterval(timer);
  timer = undefined;
  render = undefined;
  if (drawn === 0) return;
  process.stderr.write(tail);
  drawn = 0;
}

/** Draws the status block a last time, leaves it on screen, and moves to the next line. */
export function endStatus(): void {
  draw();
  closeStatus("\n");
}

/** Erases the status block. */
function clearStatus(): void {
  closeStatus(cursorToBlock());
}

const BAR_WIDTH = 30;

/** `━━━━━━━━──────────────────────  27%`, for a fraction between 0 and 1. */
export function bar(fraction: number): string {
  const filled = Math.round(fraction * BAR_WIDTH);
  return `${paint("cyan", "━".repeat(filled))}${paint("dim", "─".repeat(BAR_WIDTH - filled))} ${String(Math.floor(fraction * 100)).padStart(3)}%`;
}

/** `1m02s`, `45s`: how long a wait has lasted. */
export function elapsed(since: number): string {
  const seconds = Math.floor((Date.now() - since) / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
}
