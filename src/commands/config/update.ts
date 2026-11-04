import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2ProjectsById } from "../../lib/clients/management/generated/sdk.gen.js";
import { cloudEntry, findProjectByUrl, warnUrlAnomaly } from "../../lib/cloud-sync.js";
import {
  assertProjectUrl,
  CONFIG_FILE_WARNING,
  type ProjectEntry,
  projectOf,
  writeConfigFile,
} from "../../lib/config.js";
import { readStdin } from "../../lib/input.js";

export default class ConfigUpdate extends BaseCommand {
  static api: Api = "none";

  static override description = `Change a project of the config file.

Changes the fields given, and refuses a name that does not exist. Talks to the Management API only with --sync-with-cloud.

${CONFIG_FILE_WARNING}`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --sync-with-cloud",
    "<%= config.bin %> <%= command.id %> --project prod --project-api-key - < key.txt",
    "<%= config.bin %> <%= command.id %> --project local --project-url http://localhost:7701",
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
    ...BaseCommand.syncWithCloudFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigUpdate);
    if (flags["project-url"] !== undefined) assertProjectUrl(flags["project-url"]);
    const file = this.configFile();
    const before = projectOf(file, flags.project);
    const url = flags["project-url"] ?? before.url;
    const apiKey = flags["project-api-key"] ?? before.apiKey;
    let entry: ProjectEntry = { url, apiKey, cloud: before.cloud };
    if (flags["sync-with-cloud"]) {
      const project =
        before.cloud === undefined
          ? await findProjectByUrl(this.managementClient, url)
          : await getApiV2ProjectsById({
              client: this.managementClient,
              path: { id: before.cloud.id },
            });
      warnUrlAnomaly(flags.project, url, project);
      entry = await cloudEntry(this.managementClient, project, flags.project, url, apiKey);
    }
    writeConfigFile({ path: file.path, projects: { ...file.projects, [flags.project]: entry } });
  }
}
