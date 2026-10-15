import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { deleteApiV2ProjectsById } from "../../lib/clients/management/generated/sdk.gen.js";

export default class DeleteProjects extends BaseCommand {
  static api: Api = "management";

  static routes = ["DELETE /api/v2/projects/{id}"];

  static override description =
    "Delete a Meilisearch Cloud project, as written: no confirmation. Prints nothing on success.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 343",
    "<%= config.bin %> <%= command.id %> --id 343 --output json",
    "<%= config.bin %> <%= command.id %> --project staging",
  ];

  static override flags = {
    id: Flags.integer({
      description:
        "The project to delete, or give --project <name> and its cloudId from the config file.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeleteProjects);
    await deleteApiV2ProjectsById({
      client: this.managementClient,
      path: { id: this.cloudProjectId(flags.id) },
    });
  }
}
