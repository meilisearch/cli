import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { nextFromQuery } from "../../lib/pagination.js";
import { batchFilterFlags, batchFilterQuery } from "../../lib/task-filters.js";

export default class GetBatches extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /batches"];

  static keyActions = ["tasks.get"];

  static override description =
    "List the batches of tasks the instance processed, narrowed by --ids, --task-ids, --statuses and the other filters of the route.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --ids 7",
    "<%= config.bin %> <%= command.id %> --task-ids 42",
    "<%= config.bin %> <%= command.id %> --statuses failed --index-ids movies --limit 5",
    "<%= config.bin %> <%= command.id %> --all --output ndjson",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    ...batchFilterFlags,
    reverse: Flags.boolean({
      description: "Return the batches from the oldest uid up, instead of the newest down.",
    }),
    ...BaseCommand.fromPaginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetBatches);
    const filters = {
      ...batchFilterQuery(flags),
      reverse: flags.reverse ? true : undefined,
    };
    await this.outputList(
      (page) => this.meilisearch.batches.getBatches({ ...filters, ...page }),
      { limit: flags.limit, from: flags.from },
      flags.all,
      nextFromQuery,
    );
  }
}
