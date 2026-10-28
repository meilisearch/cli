import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { fetchKeys } from "../../lib/clients/meilisearch.js";
import { nextOffsetQuery } from "../../lib/pagination.js";

export default class GetKeys extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /keys", "GET /keys/{key}"];

  static keyActions = ["keys.get"];

  static override description = `List the API keys of the instance, or get one with --id.

The answer is the API body as it is, so it carries the \`key\` field of every key it returns: credentials that work, on stdout, like any other data.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --id 52787ccd-48ff-48e5-9c4b-03cd76978a60",
    "<%= config.bin %> <%= command.id %> --limit 5 --offset 10",
    "<%= config.bin %> <%= command.id %> --all --output ndjson",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({
      description:
        "The key to get, by its uid or by its key value. Without it, the command lists the keys.",
      helpValue: "<key>",
    }),
    ...BaseCommand.paginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetKeys);
    if (flags.id !== undefined) {
      await this.output(await this.meilisearch.getKey(flags.id));
      return;
    }
    await this.outputList(
      (query) => fetchKeys(this.meilisearch, query),
      { limit: flags.limit, offset: flags.offset },
      flags.all,
      nextOffsetQuery,
    );
  }
}
