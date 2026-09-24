/** docs/contract/output.md against errors.ts: codes and exit codes, both ways. */
import { describe, expect, it } from "vitest";
import { resolveEngineConnection } from "../../src/lib/config.js";
import {
  CLI_ERROR_CODES,
  EXIT_CODES,
  MANAGEMENT_ERROR_CODES,
  MeiliCliError,
} from "../../src/lib/errors.js";
import { codeSpans, readDoc, section, tableRows } from "./markdown.js";

const outputDoc = readDoc("docs/contract/output.md");
const errorsSection = section(outputDoc, "Errors");

describe("error codes", () => {
  it("cli_ codes of errors.ts are exactly the current list of output.md", () => {
    const documented = codeSpans(errorsSection).filter((span) => /^cli_[a-z_]+$/.test(span));
    expect(new Set(documented)).toEqual(new Set(Object.keys(CLI_ERROR_CODES)));
  });

  it("management_ codes of errors.ts are exactly those of output.md", () => {
    const documented = codeSpans(errorsSection).filter((span) => /^management_[a-z_]+$/.test(span));
    expect(new Set(documented)).toEqual(new Set(Object.keys(MANAGEMENT_ERROR_CODES)));
  });
});

describe("exit codes", () => {
  const table = tableRows(section(outputDoc, "Exit codes")).map((row) => Number(row[0]));

  it("EXIT_CODES is exactly the table 0 to 8", () => {
    expect(table).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...Object.values(EXIT_CODES)].sort()).toEqual(table);
  });

  it("every code maps to the exit code its situation has in the table", () => {
    expect(CLI_ERROR_CODES).toEqual({
      cli_usage: 2,
      cli_config: 2,
      cli_auth_missing: 3,
      cli_confirmation_required: 7,
      cli_timeout: 5,
      cli_network: 6,
      cli_task_failed: 8,
      cli_input_invalid: 2,
      cli_internal: 1,
    });
    expect(MANAGEMENT_ERROR_CODES).toEqual({
      management_unauthorized: 3,
      management_forbidden: 3,
      management_not_found: 4,
      management_unprocessable: 1,
      management_error: 1,
    });
  });

  it("an unknown context name exits 4, the one documented exception to the default of cli_config", () => {
    let error: unknown;
    try {
      resolveEngineConnection({ flags: { context: "nope" }, env: {}, file: undefined });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MeiliCliError);
    expect((error as MeiliCliError).code).toBe("cli_config");
    expect((error as MeiliCliError).exitCode).toBe(4);
  });
});
