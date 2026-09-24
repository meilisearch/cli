/**
 * Runs a command class in-process and captures stdout, stderr and the exit code.
 *
 * Command classes are imported from `src` and run directly, so vitest transpiles
 * them. Help, `--version` and unknown commands go through oclif's `run`, which
 * reads `oclif.manifest.json` and `dist` (built by `pnpm test` first).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "node:util";
import { Config, Errors, type Interfaces, run as oclifRun, settings } from "@oclif/core";
import { vi } from "vitest";

export const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));

// oclif would otherwise look for tsx or ts-node to map dist back to src.
settings.enableAutoTranspile = false;

let configPromise: Promise<Config> | undefined;

export function loadConfig(): Promise<Config> {
  configPromise ??= Config.load({ root: PROJECT_ROOT });
  return configPromise;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunOptions {
  /** Added on top of a scrubbed environment: no MEILI_*, HOME in a temp dir. */
  env?: Record<string, string | undefined>;
}

interface RunnableCommand {
  run(argv?: string[], config?: Interfaces.LoadOptions): Promise<unknown>;
}

/** Runs a command class directly, like `meili <command> ...argv`. */
export async function runCommand(
  command: RunnableCommand,
  argv: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const config = await loadConfig();
  return capture(options.env, () => command.run(argv, config));
}

/** Runs the whole CLI through oclif: help, version, unknown commands. */
export async function runCli(argv: string[], options: RunOptions = {}): Promise<RunResult> {
  const config = await loadConfig();
  return capture(options.env, () => oclifRun(argv, config));
}

const scrubbedHome = mkdtempSync(join(tmpdir(), "meili-test-home-"));

/** A fresh environment: the developer's MEILI_* variables and config file never leak in. */
export function scrubbedEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  const base: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: scrubbedHome,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: process.env.NODE_ENV,
    OCLIF_COLUMNS: process.env.OCLIF_COLUMNS,
    FORCE_COLOR: process.env.FORCE_COLOR,
    NO_COLOR: process.env.NO_COLOR,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete base[key];
    else base[key] = value;
  }
  return base;
}

async function capture(
  env: Record<string, string | undefined> | undefined,
  fn: () => Promise<unknown>,
): Promise<RunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const spies = [
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    }),
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    }),
    // oclif prints help through console.log and its own errors through console.error.
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      stdout.push(`${format(...args)}\n`);
    }),
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      stderr.push(`${format(...args)}\n`);
    }),
  ];
  const savedEnv = process.env;
  process.env = scrubbedEnv(env);
  let exitCode = 0;
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof Errors.ExitError)) throw error;
    exitCode = error.oclif.exit ?? 1;
  } finally {
    process.env = savedEnv;
    for (const spy of spies) spy.mockRestore();
  }
  return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode };
}
