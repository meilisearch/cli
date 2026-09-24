/**
 * Output contract: the only module that writes to stdout. See docs/contract/output.md.
 *
 * This file, errors.ts and config.ts implement the contract. They change only
 * through a contract pull request.
 */
import { MeiliCliError } from "./errors.js";

export const OUTPUT_MODES = ["json", "ndjson"] as const;

export type OutputMode = (typeof OUTPUT_MODES)[number];

export function isOutputMode(value: unknown): value is OutputMode {
  return typeof value === "string" && (OUTPUT_MODES as readonly string[]).includes(value);
}

export interface ResolveOutputModeOptions {
  /** Value of `--output`, already validated by the flag parser. */
  flag: string | undefined;
  env: Readonly<Record<string, string | undefined>>;
}

/** `--output` wins, then `MEILI_OUTPUT`, then `json`. */
export function resolveOutputMode(options: ResolveOutputModeOptions): OutputMode {
  if (isOutputMode(options.flag)) return options.flag;
  const fromEnv = options.env.MEILI_OUTPUT;
  if (fromEnv !== undefined && fromEnv !== "") {
    if (isOutputMode(fromEnv)) return fromEnv;
    throw new MeiliCliError(
      "cli_usage",
      `MEILI_OUTPUT must be one of ${OUTPUT_MODES.join(", ")}, got \`${fromEnv}\`.`,
    );
  }
  return "json";
}

export interface WriteDataOptions {
  mode: OutputMode;
  /** Indent the JSON. True when stdout is a TTY. */
  stdoutIsTTY: boolean;
  /** Only list commands support `ndjson`. Defaults to false. */
  supportsNdjson?: boolean;
}

/** Formats a value for stdout in the selected mode. Pure, so tests can snapshot it. */
export function formatData(value: unknown, options: WriteDataOptions): string {
  if (options.mode === "json") {
    return `${options.stdoutIsTTY ? JSON.stringify(value, null, 2) : JSON.stringify(value)}\n`;
  }
  if (options.supportsNdjson !== true) {
    throw new MeiliCliError(
      "cli_usage",
      "The `ndjson` output mode is only available on list commands. Use `--output json`.",
    );
  }
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => `${JSON.stringify(item)}\n`).join("");
}

/** Writes one result on stdout. Data only, nothing else, ever. */
export function writeData(value: unknown, options: WriteDataOptions): void {
  process.stdout.write(formatData(value, options));
}
