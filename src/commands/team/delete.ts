import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { deleteApiV2TeamsById } from "../../lib/clients/management/generated/sdk.gen.js";
import { done } from "../../lib/human.js";

export default class TeamDelete extends BaseCommand {
  static api: Api = "management";

  static routes = ["DELETE /api/v2/teams/{id}"];

  static override description = `Delete a Meilisearch Cloud team.

The team must have no project left. Prints nothing on success.`;

  static override examples = ["<%= config.bin %> <%= command.id %> --id 12 --yes"];

  static override flags = {
    id: Flags.integer({ description: "The team to delete.", helpValue: "<id>", required: true }),
    ...BaseCommand.confirmFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TeamDelete);
    await deleteApiV2TeamsById({ client: this.managementClient, path: { id: flags.id } });
    this.say(done(`Team ${flags.id} is deleted.`));
  }
}
