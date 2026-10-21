/**
 * Root and topic help with two extra sections: the global flags of every
 * command and the environment variables of docs/contract/config.md, so that
 * `meili --help` alone documents how to configure the CLI.
 */
import { Help, type Interfaces } from "@oclif/core";
import { BaseCommand } from "./base-command.js";
import { ENV_VARS } from "./config.js";

export default class MeiliHelp extends Help {
  override formatRoot(): string {
    const variables = ENV_VARS.map((variable): [string, string] => [
      variable.name,
      variable.description,
    ]);
    return [
      super.formatRoot(),
      this.section("GLOBAL FLAGS", globalFlagRows()),
      this.section("ENVIRONMENT VARIABLES", variables),
    ].join("\n\n");
  }

  protected override formatTopic(topic: Interfaces.Topic): string {
    // `super` ends with a blank line, and oclif prints the commands of the topic
    // right after this: the section is joined to the trimmed text and keeps the
    // one trailing newline that separates it from them.
    const topicHelp = super.formatTopic(topic).trimEnd();
    return `${topicHelp}\n\n${this.section("GLOBAL FLAGS", globalFlagRows())}\n`;
  }
}

/** `-o, --output=<mode>` and its description, in the order of the contract table. */
function globalFlagRows(): [string, string][] {
  return Object.entries(BaseCommand.baseFlags).map(([name, flag]) => {
    const short = flag.char === undefined ? "" : `-${flag.char}, `;
    const value = flag.type === "option" ? `=${flag.helpValue}` : "";
    return [`${short}--${name}${value}`, flag.description ?? ""];
  });
}
