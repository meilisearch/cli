import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import {
  CONFIG_FILE_WARNING,
  parseProjectUrl,
  projectOf,
  writeConfigFile,
} from "../../lib/config.js";
import { MeiliCliError } from "../../lib/errors.js";

export default class ConfigUpdate extends BaseCommand {
  static api: Api = "none";

  static override description =
    `Change the URL, the key or the cloudId of a project of the config file.

${CONFIG_FILE_WARNING}`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --project-cloud-id 343",
    "<%= config.bin %> <%= command.id %> --project prod --project-api-key - < key.txt",
    "<%= config.bin %> <%= command.id %> --project prod --project-url https://ms-abc.sfo.meilisearch.io --output json",
  ];

  static override flags = {
    project: Flags.string({
      required: true,
      description: "Name of the project to change.",
      helpValue: "<name>",
    }),
    "project-url": Flags.string({ description: "New URL of the project.", helpValue: "<url>" }),
    "project-cloud-id": Flags.integer({
      description: "Id of the project in Meilisearch Cloud, for the management commands.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigUpdate);
    const url = flags["project-url"];
    const apiKey = this.globalFlags["project-api-key"];
    const cloudId = flags["project-cloud-id"];
    if (url === undefined && apiKey === undefined && cloudId === undefined) {
      throw new MeiliCliError(
        "cli_usage",
        "Nothing to change: give `--project-url`, `--project-api-key` or `--project-cloud-id`.",
      );
    }
    const file = this.configFile();
    const entry = projectOf(file, flags.project);
    writeConfigFile({
      path: file.path,
      projects: {
        ...file.projects,
        [flags.project]: {
          url: url === undefined ? entry.url : parseProjectUrl(url),
          apiKey: apiKey ?? entry.apiKey,
          cloudId: cloudId ?? entry.cloudId,
        },
      },
    });
  }
}
