import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2Teams } from "../../lib/clients/management/generated/sdk.gen.js";

export default class TeamList extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/teams"];

  static override description = `List the Meilisearch Cloud teams.

Only the teams the token sees.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --output ndjson",
  ];

  async run(): Promise<void> {
    await this.parse(TeamList);
    await this.outputPage(await getApiV2Teams({ client: this.managementClient }));
  }
}
