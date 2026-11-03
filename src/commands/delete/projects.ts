import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { deleteApiV2ProjectsById } from "../../lib/clients/management/generated/sdk.gen.js";
import { cloudProjectEntry, writeConfigFile } from "../../lib/config.js";

export default class DeleteProjects extends BaseCommand {
  static api: Api = "management";

  static routes = ["DELETE /api/v2/projects/{id}"];

  static override description =
    "Delete a Meilisearch Cloud project, with its data. Prints nothing on success.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 343 --yes",
    "<%= config.bin %> <%= command.id %> --id 343 --yes --output json",
    "<%= config.bin %> <%= command.id %> --project staging --yes",
    "<%= config.bin %> <%= command.id %> --project staging --yes --sync-config",
  ];

  static override flags = {
    ...BaseCommand.managementFlags,
    ...BaseCommand.cloudProjectFlags,
    id: Flags.integer({
      description:
        "The project to delete, or give --project <name> and its cloud.id from the config file.",
      helpValue: "<id>",
    }),
    "sync-config": Flags.boolean({
      description:
        "Remove the project's entry from the config file: the entry --project names, or the one whose cloud.id is --id.",
    }),
    ...BaseCommand.confirmFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeleteProjects);
    const id = this.cloudProjectId(flags.id);
    const file = flags["sync-config"] ? this.configFile() : undefined;
    const entry =
      file === undefined
        ? undefined
        : cloudProjectEntry(file, flags.project, id, ": nothing was deleted.");
    await deleteApiV2ProjectsById({ client: this.managementClient, path: { id } });
    if (file === undefined || entry === undefined) return;
    const { [entry]: _removed, ...projects } = file.projects;
    writeConfigFile({ path: file.path, projects });
  }
}
