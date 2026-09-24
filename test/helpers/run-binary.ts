/** Runs the built CLI (`bin/run.js`) as a child process. Used by integration tests. */
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const BIN = fileURLToPath(new URL("../../bin/run.js", import.meta.url));

export interface BinaryResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const home = mkdtempSync(join(tmpdir(), "meili-integration-home-"));

/** Spawns `node bin/run.js ...args` with a clean environment plus `env`. */
export function runBinary(args: string[], env: Record<string, string> = {}): Promise<BinaryResult> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [BIN, ...args],
      {
        env: { PATH: process.env.PATH ?? "", HOME: home, NO_COLOR: "1", ...env },
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error !== null && typeof error.code !== "number") {
          reject(error);
          return;
        }
        resolve({ stdout, stderr, exitCode: error === null ? 0 : (error.code as number) });
      },
    );
  });
}
