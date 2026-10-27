import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { nextFromQuery } from "../../lib/pagination.js";
import { taskFilterFlags, taskFilterQuery } from "../../lib/task-filters.js";

export default class GetTasks extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /tasks"];

  static keyActions = ["tasks.get"];

  static override description =
    "List the tasks of the instance, narrowed by --ids, --statuses, --types and the other filters of the route.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --ids 42",
    "<%= config.bin %> <%= command.id %> --statuses failed,canceled --limit 5",
    "<%= config.bin %> <%= command.id %> --index-ids movies --types documentAdditionOrUpdate",
    "<%= config.bin %> <%= command.id %> --all --output ndjson",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    ...taskFilterFlags,
    reverse: Flags.boolean({
      description: "Return the tasks from the oldest uid up, instead of the newest down.",
    }),
    ...BaseCommand.fromPaginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetTasks);
    const filters = {
      ...taskFilterQuery(flags),
      reverse: flags.reverse ? true : undefined,
    };
    await this.outputList(
      (page) => this.meilisearch.tasks.getTasks({ ...filters, ...page }),
      { limit: flags.limit, from: flags.from },
      flags.all,
      nextFromQuery,
    );
  }
}
