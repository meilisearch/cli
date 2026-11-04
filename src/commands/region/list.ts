import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2Regions } from "../../lib/clients/management/generated/sdk.gen.js";

export default class RegionList extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/regions"];

  static override description = `List the Meilisearch Cloud regions.

The regions where a project can run.`;

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    await this.parse(RegionList);
    await this.output(await getApiV2Regions({ client: this.managementClient }));
  }
}
