import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { projectOf, writeConfigFile } from "../../lib/config.js";

export default class ConfigRemove extends BaseCommand {
  static api: Api = "none";

  static override description = `Remove a project from the config file.

The file holds API keys and decides where every later command goes, for every process that reads it: an agent runs this only when the human asked for it explicitly.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod",
    "<%= config.bin %> <%= command.id %> --project prod --output json",
  ];

  static override flags = {
    project: Flags.string({
      required: true,
      description: "Name of the project to remove.",
      helpValue: "<name>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigRemove);
    const file = this.configFile();
    projectOf(file, flags.project);
    const { [flags.project]: _removed, ...projects } = file.projects;
    writeConfigFile({ path: file.path, projects });
  }
}
