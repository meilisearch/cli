import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { postApiV2Projects } from "../../lib/clients/management/generated/sdk.gen.js";
import type { PostApiV2ProjectsData } from "../../lib/clients/management/generated/types.gen.js";
import { assertNoProject, writeConfigFile } from "../../lib/config.js";
import { MeiliCliError } from "../../lib/errors.js";

export default class CreateProjects extends BaseCommand {
  static api: Api = "management";

  static routes = ["POST /api/v2/projects"];

  static override description = "Create a Meilisearch Cloud project in a team, on a resource.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3",
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3 --output json",
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3 --add-to-config",
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3 --ms-version v1.54.0",
    '<%= config.bin %> <%= command.id %> --data \'{"name":"demo","teamId":12,"resourceId":3}\'',
    "<%= config.bin %> <%= command.id %> --file project.json --name other-name",
  ];

  static override flags = {
    name: Flags.string({ description: "Name of the project.", helpValue: "<name>" }),
    "team-id": Flags.integer({ description: "Team that owns the project.", helpValue: "<id>" }),
    "resource-id": Flags.integer({
      description: "Resource of the project: its plan and its region.",
      helpValue: "<id>",
    }),
    "ms-version": Flags.string({
      description: "Meilisearch version of the project, the latest by default.",
      helpValue: "<version>",
    }),
    "add-to-config": Flags.boolean({
      description:
        "Add the project to the config file, as an entry named after it with its URL, its master key and its cloudId.",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CreateProjects);
    const body = this.body<NonNullable<PostApiV2ProjectsData["body"]>>(flags, {
      name: flags.name,
      teamId: flags["team-id"],
      resourceId: flags["resource-id"],
      msVersion: flags["ms-version"],
    });
    const file = flags["add-to-config"] ? this.configFile() : undefined;
    if (file !== undefined) {
      if (typeof body.name !== "string" || body.name === "") {
        throw new MeiliCliError(
          "cli_usage",
          "`--add-to-config` names the entry after the project: give `--name`.",
        );
      }
      assertNoProject(
        file,
        body.name,
        ": nothing was created.",
        `Run \`meili config remove --project ${body.name}\` first.`,
      );
    }
    const project = await postApiV2Projects({ client: this.managementClient, body });
    await this.output(project);
    if (file === undefined) return;
    if (project.url == null) {
      throw new MeiliCliError(
        "cli_config",
        `Project ${project.id} is created but has no URL yet, so it was not added to ${file.path}.`,
        { hint: "Run `meili config sync-with-cloud` once it has one." },
      );
    }
    writeConfigFile({
      path: file.path,
      projects: {
        ...file.projects,
        [project.name]: { url: project.url, apiKey: project.masterKey, cloudId: project.id },
      },
    });
  }
}
