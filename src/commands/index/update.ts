import { Flags } from "@oclif/core";
import type { IndexOptions } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { readJsonObjectBody } from "../../lib/input.js";

export default class IndexUpdate extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["PATCH /indexes/{index_uid}"];

  static keyActions = ["indexes.update"];

  static override description = `Change the primary key or the name of an index.

--primary-key changes the primary key, and --new-id renames the index.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --id movies --primary-key movie_id",
    "<%= config.bin %> <%= command.id %> --project prod --id movies --new-id films",
    "<%= config.bin %> <%= command.id %> --project prod --id movies --new-id films --wait",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({
      required: true,
      description: "The index to update.",
      helpValue: "<index>",
    }),
    "new-id": Flags.string({
      aliases: ["uid"],
      description: "New uid of the index, which renames it.",
      helpValue: "<index>",
    }),
    "primary-key": Flags.string({
      description: "The field that holds the identifier of each document.",
      helpValue: "<field>",
    }),
    ...BaseCommand.bodyInputFlags,
    ...BaseCommand.waitFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(IndexUpdate);
    const options = { ...readJsonObjectBody(flags) } as IndexOptions;
    if (flags["primary-key"] !== undefined) options.primaryKey = flags["primary-key"];
    if (flags["new-id"] !== undefined) options.uid = flags["new-id"];
    await this.outputTask(await this.meilisearch.updateIndex(flags.id, options), flags);
  }
}
