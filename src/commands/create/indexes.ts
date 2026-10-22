import { Flags } from "@oclif/core";
import type { IndexOptions } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { readBodyInput } from "../../lib/input.js";

export default class CreateIndexes extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /indexes"];

  static keyActions = ["indexes.create"];

  static override description = "Create an index, which the API answers with a task.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id movies",
    "<%= config.bin %> <%= command.id %> --id movies --primary-key id --output json",
    "<%= config.bin %> <%= command.id %> --id movies --wait",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({
      required: true,
      description: "The index to create.",
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
    const { flags } = await this.parse(CreateIndexes);
    const body = readBodyInput<IndexOptions>(flags);
    const primaryKey = flags["primary-key"] ?? body?.primaryKey;
    // The whole body goes out: createIndex posts `{ ...options, uid }`, so a
    // field this command declares no flag for reaches the API and the API
    // refuses it. Reading `primaryKey` alone would drop a typo in silence.
    const task = await this.meilisearch.createIndex(flags.id, { ...body, primaryKey });
    await this.outputTask(task, flags);
  }
}
