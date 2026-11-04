import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2Projects } from "../../lib/clients/management/generated/sdk.gen.js";

export default class ProjectList extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/projects"];

  static override description = `List the Meilisearch Cloud projects.

Only the projects the token sees.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --team-id 12",
  ];

  static override flags = {
    "team-id": Flags.integer({
      description: "Only the projects of this team.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ProjectList);
    await this.output(
      await getApiV2Projects({
        client: this.managementClient,
        query: { teamId: flags["team-id"] },
      }),
    );
  }
}
