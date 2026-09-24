/**
 * `--wait` and `--timeout` for asynchronous engine tasks. See docs/contract/output.md.
 */
import type { Meilisearch, Task } from "meilisearch";
import { MeiliCliError } from "./errors.js";

export const DEFAULT_TIMEOUT = "60s";

const INITIAL_INTERVAL_MS = 100;
const MAX_INTERVAL_MS = 1000;

const FINAL_STATUSES: ReadonlySet<string> = new Set(["succeeded", "failed", "canceled"]);
const FAILURE_STATUSES: ReadonlySet<string> = new Set(["failed", "canceled"]);

export function isTaskFinal(task: Pick<Task, "status">): boolean {
  return FINAL_STATUSES.has(task.status);
}

/** True when the task ended with `failed` or `canceled`: exit code 8. */
export function isTaskFailure(task: Pick<Task, "status">): boolean {
  return FAILURE_STATUSES.has(task.status);
}

const DURATION = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/;
const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const;

/** Parses `500ms`, `30s`, `2m` into milliseconds. */
export function parseDuration(input: string): number {
  const match = input.trim().match(DURATION);
  const unit = match?.[2] as keyof typeof UNIT_MS | undefined;
  if (match === null || match === undefined || unit === undefined) {
    throw new MeiliCliError(
      "cli_usage",
      `Invalid duration \`${input}\`. Use a number followed by ms, s, m or h, for example 500ms, 30s, 2m.`,
    );
  }
  return Math.round(Number(match[1]) * UNIT_MS[unit]);
}

/** Renders milliseconds with the largest exact unit: 60000 is `1m`, 1500 is `1500ms`. */
export function formatDuration(ms: number): string {
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

export interface WaitForTaskOptions {
  timeoutMs: number;
  /** Called after every poll that did not reach a final status. */
  onProgress?: (task: Task) => void;
  /** First delay between polls. Doubles up to one second. Tests use a small value. */
  initialIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Polls `GET /tasks/{uid}` until `succeeded`, `failed` or `canceled`, starting
 * at 100 ms and growing to 1 s between calls. Throws `cli_timeout` when the
 * deadline passes; the task keeps running on the server.
 */
export async function waitForTask(
  client: Meilisearch,
  uid: number,
  options: WaitForTaskOptions,
): Promise<Task> {
  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + options.timeoutMs;
  let interval = options.initialIntervalMs ?? INITIAL_INTERVAL_MS;
  for (;;) {
    const task = await client.tasks.getTask(uid);
    if (isTaskFinal(task)) return task;
    options.onProgress?.(task);
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new MeiliCliError(
        "cli_timeout",
        `Task ${uid} did not reach a final status within ${formatDuration(options.timeoutMs)}. It keeps running on the server.`,
        { hint: `Run \`meili task get ${uid}\` to check its status.` },
      );
    }
    await sleep(Math.min(interval, remaining));
    interval = Math.min(interval * 2, MAX_INTERVAL_MS);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
