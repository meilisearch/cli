import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { deleteApiV2ProjectsById } from "../../lib/clients/management/generated/sdk.gen.js";

export default class DeleteProjects extends BaseCommand {
  static api: Api = "management";

  static routes = ["DELETE /api/v2/projects/{id}"];

  static override description =
    "Delete a Meilisearch Cloud project, with its data. Prints nothing on success.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 343 --yes",
    "<%= config.bin %> <%= command.id %> --id 343 --yes --output json",
    "<%= config.bin %> <%= command.id %> --project staging --yes",
  ];

  static override flags = {
    ...BaseCommand.managementFlags,
    ...BaseCommand.cloudProjectFlags,
    id: Flags.integer({
      description:
        "The project to delete, or give --project <name> and its cloudId from the config file.",
      helpValue: "<id>",
    }),
    ...BaseCommand.confirmFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeleteProjects);
    await deleteApiV2ProjectsById({
      client: this.managementClient,
      path: { id: this.cloudProjectId(flags.id) },
    });
  }
}
