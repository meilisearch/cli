import { type Api, BaseCommand } from "../../lib/base-command.js";
import { fetchKeys } from "../../lib/clients/meilisearch.js";
import { nextOffsetQuery } from "../../lib/pagination.js";

export default class KeyList extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /keys"];

  static keyActions = ["keys.get"];

  static override description = `List the API keys of the instance.

The answer is the API body as it is, so it carries the \`key\` field of every key it returns: credentials that work, on stdout, like any other data.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod",
    "<%= config.bin %> <%= command.id %> --project prod --output json",
    "<%= config.bin %> <%= command.id %> --project prod --limit 5 --offset 10",
    "<%= config.bin %> <%= command.id %> --project prod --all --output ndjson",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    ...BaseCommand.paginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(KeyList);
    await this.outputList(
      (query) => fetchKeys(this.meilisearch, query),
      { limit: flags.limit, offset: flags.offset },
      flags.all,
      nextOffsetQuery,
    );
  }
}
