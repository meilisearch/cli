/**
 * The selectors the three task routes share: `GET /tasks`, `POST /tasks/cancel`
 * and `DELETE /tasks` take the same query parameters, so `get tasks`,
 * `cancel tasks` and `delete tasks` spread the same flags and build the same
 * query. Named by what they identify, with the API spelling as an alias
 * (docs/contract/commands.md, rule 5).
 */
import { Flags, type Interfaces } from "@oclif/core";
import type { DeleteOrCancelTasksQuery } from "meilisearch";

export const taskFilterFlags = {
  ids: Flags.string({
    aliases: ["uids", "id"],
    description: "Task uids to match, comma-separated. `*` matches every one.",
    helpValue: "<uids>",
  }),
  "batch-ids": Flags.string({
    aliases: ["batch-uids"],
    description: "Match the tasks of these batch uids, comma-separated. `*` matches every one.",
    helpValue: "<uids>",
  }),
  "index-ids": Flags.string({
    aliases: ["index-uids"],
    description: "Match the tasks of these indexes, comma-separated. `*` matches every one.",
    helpValue: "<indexes>",
  }),
  "canceled-by": Flags.string({
    description:
      "Match the tasks canceled by these taskCancelation uids, comma-separated. `*` matches every one.",
    helpValue: "<uids>",
  }),
  types: Flags.string({
    description:
      "Task types to match, comma-separated, as the `type` field of a task spells them, for example `documentAdditionOrUpdate`. `*` matches every one.",
    helpValue: "<types>",
  }),
  statuses: Flags.string({
    description:
      "Task statuses to match, comma-separated: enqueued, processing, succeeded, failed or canceled. `*` matches every one.",
    helpValue: "<statuses>",
  }),
  "after-enqueued-at": Flags.string({
    description: "Match the tasks enqueued after this date, in RFC 3339 format.",
    helpValue: "<date>",
  }),
  "before-enqueued-at": Flags.string({
    description: "Match the tasks enqueued before this date, in RFC 3339 format.",
    helpValue: "<date>",
  }),
  "after-started-at": Flags.string({
    description: "Match the tasks started after this date, in RFC 3339 format.",
    helpValue: "<date>",
  }),
  "before-started-at": Flags.string({
    description: "Match the tasks started before this date, in RFC 3339 format.",
    helpValue: "<date>",
  }),
  "after-finished-at": Flags.string({
    description: "Match the tasks finished after this date, in RFC 3339 format.",
    helpValue: "<date>",
  }),
  "before-finished-at": Flags.string({
    description: "Match the tasks finished before this date, in RFC 3339 format.",
    helpValue: "<date>",
  }),
};

export type TaskFilterFlagValues = Interfaces.InferredFlags<typeof taskFilterFlags>;

/** The filters of a task route, read from the flags the three commands share. */
export function taskFilterQuery(flags: TaskFilterFlagValues): DeleteOrCancelTasksQuery {
  const query = {
    uids: flags.ids,
    batchUids: flags["batch-ids"],
    indexUids: flags["index-ids"],
    canceledBy: flags["canceled-by"],
    types: flags.types,
    statuses: flags.statuses,
    afterEnqueuedAt: flags["after-enqueued-at"],
    beforeEnqueuedAt: flags["before-enqueued-at"],
    afterStartedAt: flags["after-started-at"],
    beforeStartedAt: flags["before-started-at"],
    afterFinishedAt: flags["after-finished-at"],
    beforeFinishedAt: flags["before-finished-at"],
  };
  // The comma-separated list a flag carries is already the API's own GET syntax,
  // so the text travels as it is. meilisearch-js types the identifier lists as
  // arrays of numbers, which it joins back into the same request line.
  return query as DeleteOrCancelTasksQuery;
}
