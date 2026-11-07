import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2ProjectsById } from "../../lib/clients/management/generated/sdk.gen.js";
import { projectView } from "../../lib/human.js";

export default class ProjectView extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/projects/{id}"];

  static override description = `Get one Meilisearch Cloud project.

--id or --project names it.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 343",
    "<%= config.bin %> <%= command.id %> --project prod",
  ];

  static override flags = {
    ...BaseCommand.cloudProjectFlags,
    id: Flags.integer({
      description:
        "The project to get, or give --project <name> and its cloud.id from the config file.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ProjectView);
    await this.output(
      await getApiV2ProjectsById({
        client: this.managementClient,
        path: { id: this.cloudProjectId(flags.id) },
      }),
      (project) => ({ data: projectView(project) }),
    );
  }
}
