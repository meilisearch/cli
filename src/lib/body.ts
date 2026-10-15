/**
 * The JSON body of a write command: `--file` or `--data`, then the body-field
 * flags, which override field by field (docs/contract/output.md, "Input").
 */
import { readFileSync } from "node:fs";
import { isRecord, MeiliCliError } from "./errors.js";
import { readStdin } from "./input.js";

export interface BodyInputFlags {
  file?: string | undefined;
  data?: string | undefined;
}

/**
 * The body to send: the object of `--file` (`-` is stdin) or `--data`, then
 * the flags given, field by field. A flag valued `null` sends a JSON null; a
 * flag not given leaves the field as it is.
 */
export function buildBody(
  flags: BodyInputFlags,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...readInput(flags) };
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    body[name] = value === "null" ? null : value;
  }
  return body;
}

function readInput(flags: BodyInputFlags): Record<string, unknown> | undefined {
  if (flags.data !== undefined) return parseObject(flags.data, "--data");
  if (flags.file === undefined) return undefined;
  if (flags.file === "-") return parseObject(readStdin(), "stdin");
  let text: string;
  try {
    text = readFileSync(flags.file, "utf8");
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new MeiliCliError("cli_input_invalid", `Cannot read ${flags.file}: ${reason}`, { cause });
  }
  return parseObject(text, flags.file);
}

/** Not JSON, or not an object, is `cli_input_invalid` (output.md, "Input"). */
function parseObject(text: string, source: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new MeiliCliError("cli_input_invalid", `The body from ${source} is not valid JSON.`, {
      cause,
    });
  }
  if (!isRecord(parsed)) {
    throw new MeiliCliError("cli_input_invalid", `The body from ${source} must be a JSON object.`);
  }
  return parsed;
}
