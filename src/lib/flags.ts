import { Flags } from "@oclif/core";

/**
 * A flag that takes a comma-separated list, the GET syntax of the API itself:
 * `--fields id,title` (docs/contract/commands.md, rule 7).
 */
export const listFlag = Flags.custom<string[]>({ parse: async (value) => value.split(",") });
