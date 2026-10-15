import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import {
  assertNoProject,
  CONFIG_FILE_WARNING,
  parseProjectUrl,
  writeConfigFile,
} from "../../lib/config.js";

export default class ConfigAdd extends BaseCommand {
  static api: Api = "none";

  static override description =
    `Add a project to the config file, creating it owner-only; refuses a name that exists.

${CONFIG_FILE_WARNING}`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project local --project-url http://localhost:7700",
    "<%= config.bin %> <%= command.id %> --project prod --project-url https://ms-abc.sfo.meilisearch.io --project-api-key - < key.txt",
    "<%= config.bin %> <%= command.id %> --project prod --project-url https://ms-abc.sfo.meilisearch.io --project-cloud-id 343",
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
    "project-cloud-id": Flags.integer({
      description: "Id of the project in Meilisearch Cloud, for the management commands.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigAdd);
    const url = parseProjectUrl(flags["project-url"]);
    const file = this.configFile();
    assertNoProject(
      file,
      flags.project,
      ".",
      `Run \`meili config remove --project ${flags.project}\` first.`,
    );
    writeConfigFile({
      path: file.path,
      projects: {
        ...file.projects,
        [flags.project]: {
          url,
          apiKey: flags["project-api-key"],
          cloudId: flags["project-cloud-id"],
        },
      },
    });
  }
}
