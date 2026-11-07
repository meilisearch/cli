import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2OrganizationsById } from "../../lib/clients/management/generated/sdk.gen.js";
import { itemView, summaryLine } from "../../lib/human.js";
import { paint } from "../../lib/output.js";

export default class OrganizationView extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/organizations/{id}"];

  static override description = "Get one Meilisearch Cloud organization.";

  static override examples = ["<%= config.bin %> <%= command.id %> --id 7"];

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
      (organization) =>
        itemView(
          [
            paint("bold", organization.name),
            summaryLine(
              `Organization ${organization.id} (${organization.identifier})`,
              `Default team ${organization.defaultTeamId ?? paint("dim", "none")}`,
            ),
          ],
          organization,
        ),
    );
  }
}
