import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { writeConfigFile } from "../../lib/config.js";
import { MeiliCliError } from "../../lib/errors.js";

export default class ConfigAdd extends BaseCommand {
  static api: Api = "none";

  static override description =
    `Add a project to the config file, creating it owner-only; refuses a name that exists.

The file holds API keys and decides where every later command goes, for every process that reads it: an agent runs this only when the human asked for it explicitly.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project local --project-url http://localhost:7700",
    "<%= config.bin %> <%= command.id %> --project prod --project-url https://ms-abc.sfo.meilisearch.io --project-api-key - < key.txt",
    "<%= config.bin %> <%= command.id %> --project local --project-url http://localhost:7700 --output json",
  ];

  static override flags = {
    project: Flags.string({
      required: true,
      description: "Name of the project to add.",
      helpValue: "<name>",
    }),
    "project-url": Flags.string({
      required: true,
      description: "URL of the project.",
      helpValue: "<url>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigAdd);
    if (!URL.canParse(flags["project-url"])) {
      throw new MeiliCliError("cli_usage", `Invalid project URL \`${flags["project-url"]}\`.`);
    }
    const file = this.configFile();
    if (file.projects[flags.project] !== undefined) {
      throw new MeiliCliError(
        "cli_config",
        `Project \`${flags.project}\` already exists in ${file.path}.`,
        { hint: `Run \`meili config remove --project ${flags.project}\` first.` },
      );
    }
    writeConfigFile({
      path: file.path,
      projects: {
        ...file.projects,
        [flags.project]: { url: flags["project-url"], apiKey: flags["project-api-key"] },
      },
    });
  }
}
