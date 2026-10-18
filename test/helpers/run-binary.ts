/** Runs the built CLI (`bin/run.js`) as a child process. Used by integration tests. */
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scrubbedEnv } from "./run-command.js";

export const BIN = fileURLToPath(new URL("../../bin/run.js", import.meta.url));

export interface BinaryResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawns `node bin/run.js ...args` with a clean environment plus `env`. Stdin
 * is always closed, so a command that does not read it never waits.
 */
export function runBinary(
  args: string[],
  env: Record<string, string> = {},
  stdin = "",
): Promise<BinaryResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [BIN, ...args],
      { env: scrubbedEnv({ NO_COLOR: "1", ...env }), encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error !== null && typeof error.code !== "number") {
          reject(error);
          return;
        }
        resolve({ stdout, stderr, exitCode: error === null ? 0 : (error.code as number) });
      },
    );
    child.stdin?.end(stdin);
  });
}
