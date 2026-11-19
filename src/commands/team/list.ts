import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { listTeams } from "../../lib/clients/management/generated/sdk.gen.js";

export default class TeamList extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/teams"];

  static override description = `List the Meilisearch Cloud teams.

Only the teams the token sees.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --organization-id 1",
  ];

  static override flags = {
    "organization-id": Flags.integer({
      description: "Only the teams of this organization.",
      helpValue: "<id>",
    }),
    ...BaseCommand.paginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TeamList);
    await this.outputList(
      (query) => listTeams({ client: this.managementClient, query }),
      { organizationId: flags["organization-id"], limit: flags.limit, offset: flags.offset },
      flags.all,
    );
  }
}
