import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2Regions } from "../../lib/clients/management/generated/sdk.gen.js";

export default class GetRegions extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/regions"];

  static override description = "List the Meilisearch Cloud regions where a project can run.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --output ndjson",
  ];

  async run(): Promise<void> {
    await this.parse(GetRegions);
    await this.outputPage(await getApiV2Regions({ client: this.managementClient }));
  }
}
