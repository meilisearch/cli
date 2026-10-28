import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";

export default class DeleteKeys extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["DELETE /keys/{key}"];

  static keyActions = ["keys.delete"];

  static override description =
    "Delete an API key, which stops authenticating every request that carries it.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 52787ccd-48ff-48e5-9c4b-03cd76978a60 --yes",
    "<%= config.bin %> <%= command.id %> --id 52787ccd-48ff-48e5-9c4b-03cd76978a60 --yes --output json",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({
      required: true,
      description: "The key to delete, by its uid or by its key value.",
      helpValue: "<key>",
    }),
    ...BaseCommand.confirmFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeleteKeys);
    // The route answers 204 with no body, so nothing goes to stdout
    // (docs/contract/output.md, Streams).
    await this.meilisearch.deleteKey(flags.id);
  }
}
