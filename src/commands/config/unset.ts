import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { projectOf, writeConfigFile } from "../../lib/config.js";
import { done } from "../../lib/human.js";

export default class ConfigUnset extends BaseCommand {
  static api: Api = "none";

  static override description = `Remove a project from the config file.`;

  static override examples = ["<%= config.bin %> <%= command.id %> --project prod"];

  static override flags = {
    project: Flags.string({
      char: "p",
      required: true,
      description: "Name of the project to remove.",
      helpValue: "<name>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigUnset);
    const file = this.configFile();
    projectOf(file, flags.project);
    const { [flags.project]: _removed, ...projects } = file.projects;
    writeConfigFile({ path: file.path, projects });
    this.say(done(`Project ${flags.project} is removed from ${file.path}.`));
  }
}
