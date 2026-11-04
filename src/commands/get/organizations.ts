import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import {
  getApiV2Organizations,
  getApiV2OrganizationsById,
} from "../../lib/clients/management/generated/sdk.gen.js";

export default class GetOrganizations extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/organizations", "GET /api/v2/organizations/{id}"];

  static override description =
    "List the Meilisearch Cloud organizations the token sees, or get one with --id.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --id 7",
    "<%= config.bin %> <%= command.id %> --output ndjson",
  ];

  static override flags = {
    id: Flags.integer({
      description: "The organization to get. Without it, the command lists the organizations.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetOrganizations);
    if (flags.id === undefined) {
      // One page and no paging flags yet (output.md, "Pagination").
      await this.outputList(
        (query) => getApiV2Organizations({ client: this.managementClient, query }),
        {},
        false,
        () => undefined,
      );
      return;
    }
    await this.output(
      await getApiV2OrganizationsById({ client: this.managementClient, path: { id: flags.id } }),
    );
  }
}
