import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";

export default class DeleteIndexes extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["DELETE /indexes/{index_uid}"];

  static keyActions = ["indexes.delete"];

  static override description =
    "Delete an index, with its documents, its settings and its task history.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id movies --yes",
    "<%= config.bin %> <%= command.id %> --id movies --yes --output json",
    "<%= config.bin %> <%= command.id %> --id movies --yes --wait",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({
      required: true,
      description: "The index to delete.",
      helpValue: "<index>",
    }),
    ...BaseCommand.waitFlags,
    ...BaseCommand.confirmFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeleteIndexes);
    await this.outputTask(await this.meilisearch.deleteIndex(flags.id), flags);
  }
}
