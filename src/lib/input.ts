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
 * file the CLI cannot read, text that is not JSON, or a scalar where a body is
 * expected is `cli_input_invalid` and exit 2, before anything is sent
 * (docs/contract/output.md, "Input"). The type parameter says what the route
 * takes, it does not check it: the fields a command declares no flag for travel
 * to the API, which is the one that refuses them.
 * Commands call it from `run()`, once: nothing here is memoized.
 */
export function readBodyInput<T = unknown>(flags: BodyInputFlagValues): T | undefined {
  const text = flags.data ?? (flags.file === undefined ? undefined : readBodyFile(flags.file));
  if (text === undefined) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new MeiliCliError(
      "cli_input_invalid",
      `The body is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (body === null || typeof body !== "object") {
    throw new MeiliCliError("cli_input_invalid", "The body must be a JSON object or array.");
  }
  return body as T;
}

function readBodyFile(path: string): string {
  if (path === "-") return readStdin();
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new MeiliCliError("cli_input_invalid", `Cannot read the body file ${path}.`);
  }
}
