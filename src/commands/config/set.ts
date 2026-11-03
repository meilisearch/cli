import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { cloudEntry, findProjectByUrl } from "../../lib/cloud-sync.js";
import {
  assertNoProject,
  assertProjectUrl,
  CONFIG_FILE_WARNING,
  type ProjectEntry,
  writeConfigFile,
} from "../../lib/config.js";
import { readStdin } from "../../lib/input.js";

export default class ConfigSet extends BaseCommand {
  static api: Api = "none";

  static override description =
    `Set a project in the config file, creating the file owner-only; refuses a name that exists. Talks to the Management API only with --sync-with-cloud.

${CONFIG_FILE_WARNING}`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project local --project-url http://localhost:7700",
    "<%= config.bin %> <%= command.id %> --project prod --project-url https://ms-abc.sfo.meilisearch.io --project-api-key - < key.txt",
    "<%= config.bin %> <%= command.id %> --project prod --project-url https://ms-abc.sfo.meilisearch.io --sync-with-cloud",
    "<%= config.bin %> <%= command.id %> --project local --project-url http://localhost:7700 --output json",
  ];

  static override flags = {
    project: Flags.string({
      required: true,
      description: "Name of the project to set.",
      helpValue: "<name>",
    }),
    "project-url": Flags.string({
      required: true,
      description: "URL of the project.",
      helpValue: "<url>",
    }),
    "project-api-key": Flags.string({
      description: "API key of the project. `-` reads it from stdin, out of the shell history.",
      helpValue: "<key>",
      parse: async (value) => (value === "-" ? readStdin() : value),
    }),
    ...BaseCommand.syncWithCloudFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSet);
    const url = flags["project-url"];
    assertProjectUrl(url);
    const file = this.configFile();
    assertNoProject(file, flags.project, ".");
    const apiKey = flags["project-api-key"];
    const entry: ProjectEntry = flags["sync-with-cloud"]
      ? await cloudEntry(
          this.managementClient,
          await findProjectByUrl(this.managementClient, url),
          flags.project,
          url,
          apiKey,
        )
      : { url, apiKey };
    writeConfigFile({ path: file.path, projects: { ...file.projects, [flags.project]: entry } });
  }
}
