import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";

export default class GetIndexes extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /indexes", "GET /indexes/{index_uid}"];

  static keyActions = ["indexes.get"];

  static override description = "List the indexes of the instance, or get one with --id.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --id movies",
    "<%= config.bin %> <%= command.id %> --limit 5 --offset 10",
    "<%= config.bin %> <%= command.id %> --all --output ndjson",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({
      description: "The index to get. Without it, the command lists the indexes.",
      helpValue: "<index>",
    }),
    ...BaseCommand.paginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetIndexes);
    if (flags.id !== undefined) {
      await this.output(await this.meilisearch.getRawIndex(flags.id));
      return;
    }
    await this.outputList(
      (query) => this.meilisearch.getRawIndexes(query),
      { limit: flags.limit, offset: flags.offset },
      flags.all,
    );
  }
}
