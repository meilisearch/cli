import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { patchApiV2ProjectsById } from "../../lib/clients/management/generated/sdk.gen.js";

export default class UpdateProjects extends BaseCommand {
  static api: Api = "management";

  static routes = ["PATCH /api/v2/projects/{id}"];

  static override description = "Rename a Meilisearch Cloud project.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 343 --name renamed",
    "<%= config.bin %> <%= command.id %> --id 343 --name renamed --output json",
    '<%= config.bin %> <%= command.id %> --id 343 --data \'{"name":"renamed"}\'',
  ];

  static override flags = {
    id: Flags.integer({ required: true, description: "The project to update.", helpValue: "<id>" }),
    name: Flags.string({ description: "New name of the project.", helpValue: "<name>" }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(UpdateProjects);
    const project = this.body(flags, { name: flags.name });
    await this.output(
      await patchApiV2ProjectsById({
        client: this.managementClient,
        path: { id: flags.id },
        body: { project },
      }),
    );
  }
}
