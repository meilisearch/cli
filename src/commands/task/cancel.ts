import { type Api, BaseCommand } from "../../lib/base-command.js";
import { taskFilterFlags, taskFilterQuery } from "../../lib/task-filters.js";

export default class TaskCancel extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /tasks/cancel"];

  static keyActions = ["tasks.cancel"];

  static override description = `Cancel tasks.

Cancels the enqueued and processing tasks matched by --ids, --statuses, --types and the other filters of the route.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --ids 42,1344",
    "<%= config.bin %> <%= command.id %> --project prod --ids 42 --output json",
    "<%= config.bin %> <%= command.id %> --project prod --statuses enqueued --index-ids movies",
    "<%= config.bin %> <%= command.id %> --project prod --statuses processing --wait",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    ...taskFilterFlags,
    ...BaseCommand.waitFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TaskCancel);
    await this.outputTask(await this.meilisearch.tasks.cancelTasks(taskFilterQuery(flags)), flags);
  }
}
