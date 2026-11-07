import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { deleteApiV2OrganizationsById } from "../../lib/clients/management/generated/sdk.gen.js";
import { done } from "../../lib/human.js";

export default class OrganizationDelete extends BaseCommand {
  static api: Api = "management";

  static routes = ["DELETE /api/v2/organizations/{id}"];

  static override description = `Delete a Meilisearch Cloud organization.

Prints nothing on success.`;

  static override examples = ["<%= config.bin %> <%= command.id %> --id 7 --yes"];

  static override flags = {
    id: Flags.integer({
      required: true,
      description: "The organization to delete.",
      helpValue: "<id>",
    }),
    ...BaseCommand.confirmFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(OrganizationDelete);
    await deleteApiV2OrganizationsById({ client: this.managementClient, path: { id: flags.id } });
    this.say(done(`Organization ${flags.id} is deleted.`));
  }
}
