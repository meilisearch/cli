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

/** The object given by `--file` (`-` is stdin) or `--data`, or nothing. */
export function readBodyInput(flags: BodyInputFlags): Record<string, unknown> | undefined {
  if (flags.file === undefined && flags.data === undefined) return undefined;
  const source = flags.file === undefined ? "--data" : flags.file === "-" ? "stdin" : flags.file;
  let text: string;
  try {
    text =
      flags.file === undefined
        ? (flags.data ?? "")
        : flags.file === "-"
          ? readStdin()
          : readFileSync(flags.file, "utf8");
  } catch (cause) {
    throw new MeiliCliError(
      "cli_input_invalid",
      `Cannot read ${source}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
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

/**
 * The body to send: `input`, then the flags given, field by field. A flag
 * valued `null` sends a JSON null; a flag not given leaves the field as it is.
 */
export function buildBody(
  input: Record<string, unknown> | undefined,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...input };
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    body[name] = value === "null" ? null : value;
  }
  return body;
}
