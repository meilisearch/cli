import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { postApiV2Teams } from "../../lib/clients/management/generated/sdk.gen.js";
import type { PostApiV2TeamsData } from "../../lib/clients/management/generated/types.gen.js";
import { readBodyWithFields } from "../../lib/input.js";

export default class AddTeams extends BaseCommand {
  static api: Api = "management";

  static routes = ["POST /api/v2/teams"];

  static override description = "Create a Meilisearch Cloud team in an organization.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --name search --organization-id 1",
    "<%= config.bin %> <%= command.id %> --name search --organization-id 1 --output json",
    '<%= config.bin %> <%= command.id %> --data \'{"name":"search","organizationId":1}\'',
  ];

  static override flags = {
    name: Flags.string({ description: "Name of the team.", helpValue: "<name>" }),
    "organization-id": Flags.integer({
      description: "Organization that owns the team.",
      helpValue: "<id>",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AddTeams);
    const body = readBodyWithFields(flags, {
      name: flags.name,
      organizationId: flags["organization-id"],
    }) as PostApiV2TeamsData["body"];
    await this.output(await postApiV2Teams({ client: this.managementClient, body }));
  }
}
