/**
 * Root help with the environment variables of docs/contract/config.md, so that
 * `meili --help` documents every variable, as the contract requires.
 */
import { Help } from "@oclif/core";
import { ENV_VARS } from "./config.js";

export default class MeiliHelp extends Help {
  override formatRoot(): string {
    const rows: [string, string][] = ENV_VARS.map((variable) => [
      variable.name,
      variable.description,
    ]);
    return [super.formatRoot(), this.section("ENVIRONMENT VARIABLES", rows)].join("\n\n");
  }
}
