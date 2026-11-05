/**
 * Anonymous usage analytics (ADR 0016): when nothing is sent, the anonymous id,
 * and the events a command collects while it runs. `BaseCommand` sends them
 * when the command ends, through `clients/analytics.ts`.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type AnalyticsEvent, sendEvents } from "./clients/analytics.js";
import {
  configFilePath,
  DEFAULT_MANAGEMENT_URL,
  ENV,
  type Env,
  nonEmpty,
  writeSecretFile,
} from "./config.js";
import { isRecord, writeNotice } from "./errors.js";
import { credentialsFilePath, readCredentialsFile } from "./session.js";

const NOTICE =
  "meili sends anonymous usage data to Meilisearch: the commands you run, the names of their flags, and their errors. Never the values of the flags, your data or your keys. To turn it off, set MEILI_NO_ANALYTICS=true.";

const collected: Array<Omit<AnalyticsEvent, "distinct_id">> = [];

/** Adds an event to the ones the command sends when it ends. */
export function track(event: string, properties: Record<string, unknown>): void {
  collected.push({ event, properties, timestamp: new Date().toISOString() });
}

const isOn = (value: string | undefined): boolean =>
  value === "1" || value?.toLowerCase() === "true";

/**
 * Off when the human asks, in CI, and against a Cloud other than Meilisearch
 * Cloud, whose users do not belong in its PostHog project.
 */
function enabled(env: Env): boolean {
  const managementUrl = nonEmpty(env[ENV.MANAGEMENT_URL]);
  return !(
    isOn(env[ENV.NO_ANALYTICS]) ||
    isOn(env.DO_NOT_TRACK) ||
    env.CI !== undefined ||
    (managementUrl !== undefined && managementUrl !== DEFAULT_MANAGEMENT_URL)
  );
}

const analyticsFilePath = (env: Env): string =>
  join(dirname(configFilePath(env)), "analytics.json");

/**
 * The id of `analytics.json`, next to the config file. The first time, the
 * file is written and the notice shown. When the file cannot be written, each
 * process has its own id, and the notice is not repeated on every command.
 */
function anonymousId(env: Env): string {
  const path = analyticsFilePath(env);
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (isRecord(parsed) && typeof parsed.anonymousId === "string") return parsed.anonymousId;
  } catch {
    // No file yet, or not ours: a new id replaces it.
  }
  const id = randomUUID();
  try {
    writeSecretFile(path, { anonymousId: id });
    writeNotice(NOTICE);
  } catch {
    // A read-only mount, for example.
  }
  return id;
}

/** The Cloud user of the session of `auth login`, if any. */
function sessionUserId(env: Env): string | undefined {
  try {
    return readCredentialsFile(credentialsFilePath(env), () => {})?.userId;
  } catch {
    // A malformed file: the next management command says so.
    return undefined;
  }
}

/**
 * For a session of Meilisearch Cloud, when usage data is sent: the id of the
 * Cloud user, to store in the session, and one `$identify` that joins the
 * anonymous id to it. Undefined when nothing is sent, the session belongs to
 * another Cloud, or `fetchUserId` fails: the CLI stays anonymous.
 */
export async function identify(
  env: Env,
  managementUrl: string,
  fetchUserId: () => Promise<string>,
): Promise<string | undefined> {
  if (!enabled(env) || managementUrl !== DEFAULT_MANAGEMENT_URL) return undefined;
  let userId: string;
  try {
    userId = await fetchUserId();
  } catch {
    return undefined;
  }
  track("$identify", { $anon_distinct_id: anonymousId(env) });
  return userId;
}

/** After a logout: a new anonymous id, so the next person on the machine is not joined to the previous one. */
export function resetAnonymousId(env: Env): void {
  if (!enabled(env)) return;
  try {
    writeSecretFile(analyticsFilePath(env), { anonymousId: randomUUID() });
  } catch {
    // A read-only mount, for example.
  }
}

/** Sends the events the command collected, each with `common`, then forgets them. */
export async function sendAnalytics(env: Env, common: Record<string, unknown>): Promise<void> {
  const events = collected.splice(0);
  if (!enabled(env)) return;
  const userId = sessionUserId(env);
  const distinctId = userId ?? anonymousId(env);
  const properties = {
    ...common,
    site: "cli",
    os: process.platform,
    arch: process.arch,
    node_version: process.versions.node,
    tty: process.stdin.isTTY === true && process.stderr.isTTY === true,
    $lib: "meili-cli",
    ...(userId === undefined && { $process_person_profile: false }),
  };
  await sendEvents(
    events.map((event) => ({
      ...event,
      distinct_id: distinctId,
      properties: { ...properties, ...event.properties },
    })),
  );
}

/**
 * The names of the flags on the command line, never their values. Only the
 * names the command declares: an argument that only looks like a flag is a value.
 */
export function flagNames(
  argv: readonly string[],
  flags: Record<string, { char?: string; allowNo?: boolean }>,
): string[] {
  const known = new Map<string, string>();
  for (const [name, flag] of Object.entries(flags)) {
    known.set(`--${name}`, name);
    if (flag.char !== undefined) known.set(`-${flag.char}`, name);
    if (flag.allowNo === true) known.set(`--no-${name}`, `no-${name}`);
  }
  const names = argv.flatMap((arg) => known.get(arg.split("=")[0] ?? "") ?? []);
  return [...new Set(names)];
}
