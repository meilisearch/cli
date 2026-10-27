import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { patchApiV2ProjectsById } from "../../lib/clients/management/generated/sdk.gen.js";
import type { PatchApiV2ProjectsByIdData } from "../../lib/clients/management/generated/types.gen.js";
import { readJsonObjectBody } from "../../lib/input.js";

export default class UpdateProjects extends BaseCommand {
  static api: Api = "management";

  static routes = ["PATCH /api/v2/projects/{id}"];

  static override description = "Rename a Meilisearch Cloud project.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 343 --name renamed",
    "<%= config.bin %> <%= command.id %> --id 343 --name renamed --output json",
    "<%= config.bin %> <%= command.id %> --project prod --name renamed",
    '<%= config.bin %> <%= command.id %> --id 343 --data \'{"name":"renamed"}\'',
  ];

  static override flags = {
    ...BaseCommand.managementFlags,
    ...BaseCommand.cloudProjectFlags,
    id: Flags.integer({
      description:
        "The project to update, or give --project <name> and its cloudId from the config file.",
      helpValue: "<id>",
    }),
    name: Flags.string({ description: "New name of the project.", helpValue: "<name>" }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(UpdateProjects);
    // The body goes out whole, so a field this command declares no flag for
    // reaches the API, which refuses it rather than the CLI dropping it.
    const project = { ...readJsonObjectBody(flags) } as NonNullable<
      PatchApiV2ProjectsByIdData["body"]
    >["project"];
    if (flags.name !== undefined) project.name = flags.name;
    await this.output(
      await patchApiV2ProjectsById({
        client: this.managementClient,
        path: { id: this.cloudProjectId(flags.id) },
        body: { project },
      }),
    );
  }
}
