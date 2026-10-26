import { type Api, BaseCommand } from "../../lib/base-command.js";
import { MeiliCliError } from "../../lib/errors.js";
import { taskFilterFlags, taskFilterQuery } from "../../lib/task-filters.js";

export default class DeleteTasks extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["DELETE /tasks"];

  static keyActions = ["tasks.delete"];

  static override description =
    "Delete the finished tasks matched by --ids, --statuses, --types and the other filters of the route.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --ids 42,1344 --yes",
    "<%= config.bin %> <%= command.id %> --ids 42 --yes --output json",
    "<%= config.bin %> <%= command.id %> --statuses succeeded --before-enqueued-at 2026-01-01T00:00:00Z --yes",
    "<%= config.bin %> <%= command.id %> --index-ids movies --yes --wait",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    ...taskFilterFlags,
    ...BaseCommand.waitFlags,
    ...BaseCommand.confirmFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeleteTasks);
    const query = taskFilterQuery(flags);
    // docs/contract/output.md, Destructive commands. There is no --all here:
    // the route has no form that deletes every task.
    if (Object.values(query).every((filter) => filter === undefined)) {
      throw new MeiliCliError("cli_usage", "The tasks to delete are missing.", {
        hint: "Name them with `--ids <uids>`, or match them with `--statuses <statuses>`, `--types <types>`, `--index-ids <indexes>` or a date filter such as `--before-enqueued-at <date>`.",
      });
    }
    await this.outputTask(await this.meilisearch.tasks.deleteTasks(query), flags);
  }
}
