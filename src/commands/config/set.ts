import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { assertNoProject, CONFIG_FILE_WARNING, writeConfigFile } from "../../lib/config.js";
import { MeiliCliError } from "../../lib/errors.js";
import { readStdin } from "../../lib/input.js";

export default class ConfigSet extends BaseCommand {
  static api: Api = "none";

  static override description =
    `Set a project in the config file, creating the file owner-only; refuses a name that exists.

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
    "project-cloud-id": Flags.integer({
      description: "Id of the project in Meilisearch Cloud, for the management commands.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSet);
    // A Meilisearch instance answers over HTTP(S) only; the SDK mangles any other scheme.
    const url = URL.parse(flags["project-url"]);
    if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
      throw new MeiliCliError("cli_usage", `Invalid project URL \`${flags["project-url"]}\`.`);
    }
    const file = this.configFile();
    assertNoProject(
      file,
      flags.project,
      ".",
      `Run \`meili config unset --project ${flags.project}\` first.`,
    );
    writeConfigFile({
      path: file.path,
      projects: {
        ...file.projects,
        [flags.project]: {
          url: flags["project-url"],
          apiKey: flags["project-api-key"],
          cloudId: flags["project-cloud-id"],
        },
      },
    });
  }
}
