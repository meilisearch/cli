/**
 * Output contract: the only module that writes to stdout. See docs/contract/output.md.
 *
 * This file, errors.ts and config.ts implement the contract. They change only
 * through a contract pull request.
 */

/** JSON, indented when stdout is a terminal, compact when it is piped. Pure, so tests can snapshot it. */
export function formatData(value: unknown, stdoutIsTTY: boolean): string {
  return `${stdoutIsTTY ? JSON.stringify(value, null, 2) : JSON.stringify(value)}\n`;
}

/** Writes one result on stdout. Data only, nothing else, ever. */
export function writeData(value: unknown): void {
  process.stdout.write(formatData(value, process.stdout.isTTY === true));
}
