import { type Api, BaseCommand } from "../../lib/base-command.js";
import { taskFilterFlags, taskFilterQuery } from "../../lib/task-filters.js";

export default class CancelTasks extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /tasks/cancel"];

  static keyActions = ["tasks.cancel"];

  static override description =
    "Cancel the enqueued and processing tasks matched by --ids, --statuses, --types and the other filters of the route.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --ids 42,1344",
    "<%= config.bin %> <%= command.id %> --ids 42 --output json",
    "<%= config.bin %> <%= command.id %> --statuses enqueued --index-ids movies",
    "<%= config.bin %> <%= command.id %> --statuses processing --wait",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    ...taskFilterFlags,
    ...BaseCommand.waitFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CancelTasks);
    await this.outputTask(await this.meilisearch.tasks.cancelTasks(taskFilterQuery(flags)), flags);
  }
}
