import { type Command, toConfiguredId } from "@oclif/core";
import { type Api, BaseCommand } from "../lib/base-command.js";

export default class Schema extends BaseCommand {
  static api: Api = "none";

  static override description =
    "Print every command with its flags and examples as JSON, from the oclif manifest.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> | jq '.commands[].id'",
  ];

  async run(): Promise<void> {
    const commands = this.config.commands
      .filter((command) => command.hidden !== true)
      .map((command) => this.describe(command))
      .sort((a, b) => a.id.localeCompare(b.id));
    await this.output({ name: this.config.bin, version: this.config.version, commands });
  }

  /** The fields of the manifest an agent needs; `JSON.stringify` drops the undefined ones. */
  private describe(command: Command.Loadable) {
    const id = toConfiguredId(command.id, this.config);
    return {
      id,
      description: command.description ?? "",
      examples: (command.examples ?? []).map((example) =>
        (typeof example === "string" ? example : example.command)
          .replaceAll("<%= config.bin %>", this.config.bin)
          .replaceAll("<%= command.id %>", id),
      ),
      flags: Object.values(command.flags)
        .filter((flag) => flag.hidden !== true)
        .map((flag) => ({
          name: flag.name,
          type: flag.type,
          char: flag.char,
          required: flag.required === true,
          description: flag.description,
          helpValue: flag.type === "option" ? flag.helpValue : undefined,
          options: flag.type === "option" ? flag.options : undefined,
          dependsOn: flag.dependsOn,
          exclusive: flag.exclusive,
        })),
    };
  }
}
