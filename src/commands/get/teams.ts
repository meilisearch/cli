import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import {
  getApiV2Teams,
  getApiV2TeamsById,
} from "../../lib/clients/management/generated/sdk.gen.js";

export default class GetTeams extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/teams", "GET /api/v2/teams/{id}"];

  static override description =
    "List the Meilisearch Cloud teams the token sees, or get one with --id.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --id 12",
    "<%= config.bin %> <%= command.id %> --output ndjson",
  ];

  static override flags = {
    id: Flags.integer({
      description: "The team to get. Without it, the command lists the teams.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetTeams);
    if (flags.id === undefined) {
      await this.outputPage(await getApiV2Teams({ client: this.managementClient }));
      return;
    }
    await this.output(
      await getApiV2TeamsById({ client: this.managementClient, path: { id: flags.id } }),
    );
  }
}
