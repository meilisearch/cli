import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import {
  assertProjectUrl,
  CONFIG_FILE_WARNING,
  projectOf,
  writeConfigFile,
} from "../../lib/config.js";
import { readStdin } from "../../lib/input.js";

export default class ConfigUpdate extends BaseCommand {
  static api: Api = "none";

  static override description =
    `Change the fields given of a project of the config file; refuses a name that does not exist.

${CONFIG_FILE_WARNING}`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --project-cloud-id 343",
    "<%= config.bin %> <%= command.id %> --project prod --project-api-key - < key.txt",
    "<%= config.bin %> <%= command.id %> --project local --project-url http://localhost:7701 --output json",
  ];

  static override flags = {
    project: Flags.string({
      required: true,
      description: "Name of the project to change.",
      helpValue: "<name>",
    }),
    "project-url": Flags.string({ description: "New URL of the project.", helpValue: "<url>" }),
    "project-api-key": Flags.string({
      description: "New API key of the project. `-` reads it from stdin, out of the shell history.",
      helpValue: "<key>",
      parse: async (value) => (value === "-" ? readStdin() : value),
    }),
    "project-cloud-id": Flags.integer({
      description: "New id of the project in Meilisearch Cloud, for the management commands.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigUpdate);
    if (flags["project-url"] !== undefined) assertProjectUrl(flags["project-url"]);
    const file = this.configFile();
    const entry = projectOf(file, flags.project);
    writeConfigFile({
      path: file.path,
      projects: {
        ...file.projects,
        [flags.project]: {
          url: flags["project-url"] ?? entry.url,
          apiKey: flags["project-api-key"] ?? entry.apiKey,
          cloudId: flags["project-cloud-id"] ?? entry.cloudId,
        },
      },
    });
  }
}
