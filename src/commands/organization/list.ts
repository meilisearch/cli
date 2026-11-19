import { type Api, BaseCommand } from "../../lib/base-command.js";
import { listOrganizations } from "../../lib/clients/management/generated/sdk.gen.js";
import { defaultView } from "../../lib/human.js";

export default class OrganizationList extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/organizations"];

  static override description = `List the Meilisearch Cloud organizations.

Only the organizations the token sees.`;

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  static override flags = {
    ...BaseCommand.paginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(OrganizationList);
    await this.outputList(
      (query) => listOrganizations({ client: this.managementClient, query }),
      { limit: flags.limit, offset: flags.offset },
      flags.all,
      // The table shows isAdmin where ownerId was: what matters is what the token may do.
      ({ results, ...page }) =>
        defaultView({
          ...page,
          results: results.map(({ id, name, identifier, isAdmin }) => ({
            id,
            name,
            identifier,
            isAdmin,
          })),
        }),
    );
  }
}
