import { Flags } from "@oclif/core";
import { MeiliCliError } from "./errors.js";

/**
 * A flag that takes a comma-separated list, the GET syntax of the API itself:
 * `--fields id,title` (docs/contract/commands.md, rule 7).
 */
export const listFlag = Flags.custom<string[]>({ parse: async (value) => value.split(",") });

/**
 * A flag that takes a comma-separated list of identifiers, which the API
 * numbers: `--ids 1,2`. A value that is not a whole number is `cli_usage`,
 * before any call, because the API would only see `NaN`.
 */
export const numberListFlag = Flags.custom<number[]>({
  parse: async (value, _context, flag) =>
    value.split(",").map((item) => {
      const identifier = Number(item);
      if (!Number.isInteger(identifier)) {
        throw new MeiliCliError(
          "cli_usage",
          `--${flag.name} takes identifiers, which are whole numbers: \`${item}\` is not one.`,
        );
      }
      return identifier;
    }),
});
