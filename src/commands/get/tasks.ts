import { Flags } from "@oclif/core";
import type { TaskStatus, TasksOrBatchesQuery, TaskType } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { listFlag, numberListFlag } from "../../lib/flags.js";
import { nextFromQuery } from "../../lib/pagination.js";

export default class GetTasks extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /tasks"];

  static keyActions = ["tasks.get"];

  static override description =
    "List the tasks of the instance, which every write command enqueues, and filter them with the flags.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --ids 42 --output json",
    "<%= config.bin %> <%= command.id %> --statuses failed --limit 5",
    "<%= config.bin %> <%= command.id %> --index-ids movies --types documentAdditionOrUpdate",
    "<%= config.bin %> <%= command.id %> --all --output ndjson",
  ];

  static override flags = {
    ids: numberListFlag({
      aliases: ["id", "uids"],
      description: "Identifiers of the tasks to return.",
      helpValue: "<uids>",
    }),
    statuses: listFlag({
      description:
        "Statuses to keep: enqueued, processing, succeeded, failed or canceled, comma-separated.",
      helpValue: "<statuses>",
    }),
    types: listFlag({
      description: "Task types to keep, as the API spells them, comma-separated.",
      helpValue: "<types>",
    }),
    "index-ids": listFlag({
      aliases: ["index-uids"],
      description: "Keep the tasks of these indexes.",
      helpValue: "<indexes>",
    }),
    "batch-ids": numberListFlag({
      aliases: ["batch-uids"],
      description: "Keep the tasks of these batches.",
      helpValue: "<uids>",
    }),
    "canceled-by": numberListFlag({
      description: "Keep the tasks canceled by these task identifiers.",
      helpValue: "<uids>",
    }),
    reverse: Flags.boolean({ description: "Return the oldest tasks first." }),
    "after-enqueued-at": Flags.string({
      description: "Keep the tasks enqueued after this date, as RFC 3339.",
      helpValue: "<date>",
    }),
    "before-enqueued-at": Flags.string({
      description: "Keep the tasks enqueued before this date, as RFC 3339.",
      helpValue: "<date>",
    }),
    "after-started-at": Flags.string({
      description: "Keep the tasks started after this date, as RFC 3339.",
      helpValue: "<date>",
    }),
    "before-started-at": Flags.string({
      description: "Keep the tasks started before this date, as RFC 3339.",
      helpValue: "<date>",
    }),
    "after-finished-at": Flags.string({
      description: "Keep the tasks finished after this date, as RFC 3339.",
      helpValue: "<date>",
    }),
    "before-finished-at": Flags.string({
      description: "Keep the tasks finished before this date, as RFC 3339.",
      helpValue: "<date>",
    }),
    ...BaseCommand.fromPaginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetTasks);
    const filters: TasksOrBatchesQuery = {
      uids: flags.ids,
      // The SDK narrows these two to its own unions; the API names the values it refuses.
      statuses: flags.statuses as TaskStatus[] | undefined,
      types: flags.types as TaskType[] | undefined,
      indexUids: flags["index-ids"],
      batchUids: flags["batch-ids"],
      canceledBy: flags["canceled-by"],
      reverse: flags.reverse,
      afterEnqueuedAt: flags["after-enqueued-at"],
      beforeEnqueuedAt: flags["before-enqueued-at"],
      afterStartedAt: flags["after-started-at"],
      beforeStartedAt: flags["before-started-at"],
      afterFinishedAt: flags["after-finished-at"],
      beforeFinishedAt: flags["before-finished-at"],
    };
    await this.outputList(
      (page) => this.meilisearch.tasks.getTasks({ ...filters, ...page }),
      { limit: flags.limit, from: flags.from },
      flags.all,
      nextFromQuery,
    );
  }
}
