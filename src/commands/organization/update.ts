import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { patchApiV2OrganizationsById } from "../../lib/clients/management/generated/sdk.gen.js";
import type { PatchApiV2OrganizationsByIdData } from "../../lib/clients/management/generated/types.gen.js";
import { readBodyWithFields } from "../../lib/input.js";

export default class OrganizationUpdate extends BaseCommand {
  static api: Api = "management";

  static routes = ["PATCH /api/v2/organizations/{id}"];

  static override description = "Rename a Meilisearch Cloud organization.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 7 --name Acme",
    '<%= config.bin %> <%= command.id %> --id 7 --data \'{"name":"Acme"}\'',
  ];

  static override flags = {
    id: Flags.integer({
      required: true,
      description: "The organization to update.",
      helpValue: "<id>",
    }),
    name: Flags.string({ description: "New name of the organization.", helpValue: "<name>" }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(OrganizationUpdate);
    const body = readBodyWithFields(flags, { name: flags.name }) as NonNullable<
      PatchApiV2OrganizationsByIdData["body"]
    >;
    await this.output(
      await patchApiV2OrganizationsById({
        client: this.managementClient,
        path: { id: flags.id },
        body,
      }),
    );
  }
}
