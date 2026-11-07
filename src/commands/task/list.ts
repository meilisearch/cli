import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { taskFilterFlags, taskFilterQuery } from "../../lib/task-filters.js";

export default class TaskList extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /tasks"];

  static keyActions = ["tasks.get"];

  static override description = `List the tasks of the instance.

--ids, --statuses, --types and the other filters of the route narrow the list.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod",
    "<%= config.bin %> <%= command.id %> -p prod --ids 42",
    "<%= config.bin %> <%= command.id %> -p prod --statuses failed,canceled --limit 5",
    "<%= config.bin %> <%= command.id %> -p prod --index-ids movies --types documentAdditionOrUpdate",
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
    const { flags } = await this.parse(TaskList);
    const filters = {
      ...taskFilterQuery(flags),
      reverse: flags.reverse ? true : undefined,
    };
    await this.output(
      await this.meilisearch.tasks.getTasks({ ...filters, limit: flags.limit, from: flags.from }),
    );
  }
}
