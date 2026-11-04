import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { deleteApiV2TeamsById } from "../../lib/clients/management/generated/sdk.gen.js";

export default class DeleteTeams extends BaseCommand {
  static api: Api = "management";

  static routes = ["DELETE /api/v2/teams/{id}"];

  static override description =
    "Delete a Meilisearch Cloud team that has no project left. Prints nothing on success.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 12 --yes",
    "<%= config.bin %> <%= command.id %> --id 12 --yes --output json",
  ];

  static override flags = {
    id: Flags.integer({ description: "The team to delete.", helpValue: "<id>", required: true }),
    ...BaseCommand.confirmFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeleteTeams);
    await deleteApiV2TeamsById({ client: this.managementClient, path: { id: flags.id } });
  }
}
