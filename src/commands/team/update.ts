import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { patchApiV2TeamsById } from "../../lib/clients/management/generated/sdk.gen.js";
import type { PatchApiV2TeamsByIdData } from "../../lib/clients/management/generated/types.gen.js";
import { readBodyWithFields } from "../../lib/input.js";

export default class TeamUpdate extends BaseCommand {
  static api: Api = "management";

  static routes = ["PATCH /api/v2/teams/{id}"];

  static override description = "Rename a Meilisearch Cloud team, or change its owner.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 12 --name renamed",
    "<%= config.bin %> <%= command.id %> --id 12 --name renamed --output json",
    "<%= config.bin %> <%= command.id %> --id 12 --owner-id 5b7c2f1e-8a3d-4e6f-9b0a-1c2d3e4f5a6b",
    '<%= config.bin %> <%= command.id %> --id 12 --data \'{"name":"renamed"}\'',
  ];

  static override flags = {
    id: Flags.integer({ description: "The team to update.", helpValue: "<id>", required: true }),
    name: Flags.string({ description: "New name of the team.", helpValue: "<name>" }),
    "owner-id": Flags.string({
      description: "UUID of the new owner, who must already be a member of the team.",
      helpValue: "<uuid>",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TeamUpdate);
    const body = readBodyWithFields(flags, {
      name: flags.name,
      ownerId: flags["owner-id"],
    }) as PatchApiV2TeamsByIdData["body"];
    await this.output(
      await patchApiV2TeamsById({ client: this.managementClient, path: { id: flags.id }, body }),
    );
  }
}
