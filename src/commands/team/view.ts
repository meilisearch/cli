import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2TeamsById } from "../../lib/clients/management/generated/sdk.gen.js";
import { itemView, teamSummary } from "../../lib/human.js";
import { paint } from "../../lib/output.js";

export default class TeamView extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/teams/{id}"];

  static override description = "Get one Meilisearch Cloud team.";

  static override examples = ["<%= config.bin %> <%= command.id %> --id 12"];

  static override flags = {
    id: Flags.integer({ required: true, description: "The team to get.", helpValue: "<id>" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TeamView);
    await this.output(
      await getApiV2TeamsById({ client: this.managementClient, path: { id: flags.id } }),
      (team) => itemView([paint("bold", team.name), teamSummary(team)], team),
    );
  }
}
