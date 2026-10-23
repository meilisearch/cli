import { readFileSync } from "node:fs";
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

/** The shared group `BaseCommand.bodyInputFlags`, as a command receives it. */
export interface BodyInputFlagValues {
  file?: string | undefined;
  data?: string | undefined;
}

/**
 * The JSON body of `--file` or `--data`, undefined when neither is given.
 * Read and parsed before anything is sent: a file that cannot be read and text
 * that is not JSON are `cli_input_invalid`, exit 2 (docs/contract/output.md).
 */
export function readJsonBody(flags: BodyInputFlagValues): unknown {
  const text = flags.data ?? (flags.file === undefined ? undefined : readBodyFile(flags.file));
  if (text === undefined) return undefined;
  const source = flags.data === undefined ? `\`${flags.file}\`` : "--data";
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new MeiliCliError("cli_input_invalid", `${source} is not valid JSON.`, { cause });
  }
}

function readBodyFile(path: string): string {
  if (path === "-") return readStdin();
  try {
    return readFileSync(path, "utf8");
  } catch (cause) {
    throw new MeiliCliError("cli_input_invalid", `Cannot read \`${path}\`.`, { cause });
  }
}

/** Narrows a parsed body to a JSON object, which an array and a scalar are not. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
