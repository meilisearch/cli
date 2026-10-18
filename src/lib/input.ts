import { readFileSync } from "node:fs";
import type { BodyInputFlagValues } from "./base-command.js";
import { MeiliCliError } from "./errors.js";

let stdin: string | undefined;

/**
 * Stdin to its end, without the trailing newline, read once per process: oclif
 * parses the flags in `init` and again in `run`. Called only when a flag is
 * given as `-`: a command never reads stdin otherwise (docs/contract/output.md).
 */
export function readStdin(): string {
  stdin ??= readFileSync(0, "utf8").replace(/\r?\n$/, "");
  return stdin;
}

/**
 * The JSON body of `--file` or `--data`, undefined when neither is given. A
 * file the CLI cannot read, or text that is not JSON, is `cli_input_invalid`
 * and exit 2, before anything is sent (docs/contract/output.md, "Input"). The
 * body fields a command declares as flags override what this returns.
 * Commands call it from `run()`, once: nothing here is memoized.
 */
export function readBodyInput<T = unknown>(flags: BodyInputFlagValues): T | undefined {
  const text = flags.data ?? (flags.file === undefined ? undefined : readBodyFile(flags.file));
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new MeiliCliError(
      "cli_input_invalid",
      `The body is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readBodyFile(path: string): string {
  if (path === "-") return readStdin();
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new MeiliCliError("cli_input_invalid", `Cannot read the body file ${path}.`);
  }
}

/**
 * The body of a route whose fields are also flags: what `--file` or `--data`
 * carries, with the fields the agent gave on the command line written over it.
 * A flag the agent left out never erases the field of the body
 * (docs/contract/output.md, "Input").
 */
export function bodyFrom<T extends object>(flags: BodyInputFlagValues, fields: Partial<T>): T {
  const given = Object.entries(fields).filter(([, value]) => value !== undefined);
  return { ...readBodyInput<T>(flags), ...Object.fromEntries(given) } as T;
}
