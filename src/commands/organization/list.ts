import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2Organizations } from "../../lib/clients/management/generated/sdk.gen.js";

export default class OrganizationList extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/organizations"];

  static override description = `List the Meilisearch Cloud organizations.

Only the organizations the token sees.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --output ndjson",
  ];

  async run(): Promise<void> {
    await this.parse(OrganizationList);
    await this.outputPage(await getApiV2Organizations({ client: this.managementClient }));
  }
}
