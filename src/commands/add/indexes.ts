import { Flags } from "@oclif/core";
import type { IndexOptions } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { readJsonObjectBody } from "../../lib/input.js";

export default class AddIndexes extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /indexes"];

  static keyActions = ["indexes.create"];

  static override description =
    "Create an empty index, named by --id, with --primary-key as its primary key.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id movies",
    "<%= config.bin %> <%= command.id %> --id movies --primary-key id --output json",
    "<%= config.bin %> <%= command.id %> --id movies --wait",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({
      required: true,
      aliases: ["uid"],
      description: "The index to create.",
      helpValue: "<index>",
    }),
    "primary-key": Flags.string({
      description:
        "The field that holds the identifier of each document. Without it, Meilisearch infers it from the first documents.",
      helpValue: "<field>",
    }),
    ...BaseCommand.bodyInputFlags,
    ...BaseCommand.waitFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AddIndexes);
    // The body goes out whole, so a field this command declares no flag for
    // reaches the API, which refuses it rather than the CLI dropping it.
    const options = { ...readJsonObjectBody(flags) } as IndexOptions;
    if (flags["primary-key"] !== undefined) options.primaryKey = flags["primary-key"];
    await this.outputTask(await this.meilisearch.createIndex(flags.id, options), flags);
  }
}
