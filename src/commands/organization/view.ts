import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2OrganizationsById } from "../../lib/clients/management/generated/sdk.gen.js";

export default class OrganizationView extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/organizations/{id}"];

  static override description = "Get one Meilisearch Cloud organization.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 7",
    "<%= config.bin %> <%= command.id %> --id 7 --output json",
  ];

  static override flags = {
    id: Flags.integer({
      required: true,
      description: "The organization to get.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(OrganizationView);
    await this.output(
      await getApiV2OrganizationsById({ client: this.managementClient, path: { id: flags.id } }),
    );
  }
}
