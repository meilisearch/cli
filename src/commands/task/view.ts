import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";

export default class TaskView extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /tasks/{task_id}"];

  static keyActions = ["tasks.get"];

  static override description = `Get one task.

Prints its status and its error.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --id 42",
    "<%= config.bin %> <%= command.id %> --project prod --id 42 --output json",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.integer({ required: true, description: "The task uid.", helpValue: "<uid>" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TaskView);
    await this.output(await this.meilisearch.tasks.getTask(flags.id));
  }
}
