import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { nextFromQuery } from "../../lib/pagination.js";
import { batchFilterFlags, batchFilterQuery } from "../../lib/task-filters.js";

export default class BatchList extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /batches"];

  static keyActions = ["tasks.get"];

  static override description = `List the batches of tasks.

--ids, --task-ids, --statuses and the other filters of the route narrow the list.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod",
    "<%= config.bin %> <%= command.id %> -p prod --ids 7",
    "<%= config.bin %> <%= command.id %> -p prod --task-ids 42",
    "<%= config.bin %> <%= command.id %> -p prod --statuses failed --index-ids movies --limit 5",
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
    const { flags } = await this.parse(BatchList);
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
