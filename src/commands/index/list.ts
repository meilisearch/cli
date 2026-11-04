import { type Api, BaseCommand } from "../../lib/base-command.js";
import { nextOffsetQuery } from "../../lib/pagination.js";

export default class IndexList extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /indexes"];

  static keyActions = ["indexes.get"];

  static override description = "List the indexes of the instance.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod",
    "<%= config.bin %> <%= command.id %> --project prod --limit 5 --offset 10",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    ...BaseCommand.paginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(IndexList);
    await this.outputList(
      (query) => this.meilisearch.getRawIndexes(query),
      { limit: flags.limit, offset: flags.offset },
      flags.all,
      nextOffsetQuery,
    );
  }
}
