import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";

export default class IndexDelete extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["DELETE /indexes/{index_uid}"];

  static keyActions = ["indexes.delete"];

  static override description = `Delete an index.

Deletes its documents, its settings and its task history too.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --id movies --yes",
    "<%= config.bin %> <%= command.id %> -p prod --id movies --yes --wait",
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
    const { flags } = await this.parse(IndexDelete);
    await this.outputTask(await this.meilisearch.deleteIndex(flags.id), flags, {
      enqueued: (uid) =>
        `Meilisearch received the request. Task ${uid} will delete index ${flags.id}, with its documents.`,
      pending: "The index is still there until the task succeeds. Follow it:",
      succeeded: () => `index ${flags.id} deleted, with its documents.`,
    });
  }
}
