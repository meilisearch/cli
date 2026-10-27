import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import {
  getApiV2Projects,
  getApiV2ProjectsById,
} from "../../lib/clients/management/generated/sdk.gen.js";
import { nextPageQuery, type PageQuery } from "../../lib/pagination.js";

export default class GetProjects extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/projects", "GET /api/v2/projects/{id}"];

  static override description =
    "List the Meilisearch Cloud projects the token sees, or get one with --id or --project.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --team-id 12",
    "<%= config.bin %> <%= command.id %> --id 343",
    "<%= config.bin %> <%= command.id %> --project prod",
    "<%= config.bin %> <%= command.id %> --all --output ndjson",
  ];

  static override flags = {
    ...BaseCommand.managementFlags,
    ...BaseCommand.cloudProjectFlags,
    id: Flags.integer({
      description:
        "The project to get, or give --project <name> and its cloudId from the config file. Without either, the command lists the projects.",
      helpValue: "<id>",
    }),
    "team-id": Flags.integer({
      description: "Only the projects of this team. Ignored with --id.",
      helpValue: "<id>",
    }),
    ...BaseCommand.pagePaginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetProjects);
    if (flags.id === undefined && this.globalFlags.project === undefined) {
      const query: PageQuery & { teamId?: number | undefined } = {
        teamId: flags["team-id"],
        limit: flags.limit,
        page: flags.page,
      };
      await this.outputList(
        (current) => getApiV2Projects({ client: this.managementClient, query: current }),
        query,
        flags.all === true,
        nextPageQuery,
      );
      return;
    }
    await this.output(
      await getApiV2ProjectsById({
        client: this.managementClient,
        path: { id: this.cloudProjectId(flags.id) },
      }),
    );
  }
}
