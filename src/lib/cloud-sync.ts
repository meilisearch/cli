/**
 * What the config file reads from Meilisearch Cloud on request: a project's
 * entry, its cloud identifiers and its master key. See docs/contract/config.md,
 * "Cloud projects", and ADR 0011.
 */

import {
  getApiV2Projects,
  getApiV2ProjectsById,
  getApiV2ProjectsByProjectIdMasterKey,
  getApiV2Teams,
} from "./clients/management/generated/sdk.gen.js";
import type { Pagination, Project } from "./clients/management/generated/types.gen.js";
import type { ManagementClient } from "./clients/management.js";
import { type CloudIdentifiers, type ProjectEntry, parseUrl } from "./config.js";
import { ManagementApiError, MeiliCliError, toRenderedError, writeWarning } from "./errors.js";
import { iteratePages, nextPageQuery, type PageQuery } from "./pagination.js";
import { formatDuration, type PollOptions, pollUntil } from "./tasks.js";

/** A project the CLI can write an entry for: one with a URL. */
export type ReachableProject = Project & { url: string };

/** Every item of a list route of the Management API, page after page. */
export async function everyPage<Q extends PageQuery, T>(
  fetchPage: (query: Q) => Promise<Pagination & { results: T[] }>,
  query: Q,
): Promise<T[]> {
  const items: T[] = [];
  for await (const page of iteratePages(fetchPage, query, nextPageQuery)) {
    items.push(...page.results);
  }
  return items;
}

/** The projects the token sees, or the ones of a team. */
export function listCloudProjects(client: ManagementClient, teamId?: number): Promise<Project[]> {
  return everyPage((query) => getApiV2Projects({ client, query }), { page: 1, teamId });
}

/** The Cloud project whose URL has the scheme and host of `url`, or `cli_config`. */
export async function findProjectByUrl(
  client: ManagementClient,
  url: string,
): Promise<ReachableProject> {
  const project = (await listCloudProjects(client)).find(
    (each): each is ReachableProject => each.url != null && sameOrigin(each.url, url),
  );
  if (project === undefined) {
    throw new MeiliCliError(
      "cli_config",
      `No Meilisearch Cloud project has the URL ${url}: nothing was written.`,
    );
  }
  return project;
}

/** An API error the command goes on through, as a warning that keeps the API's code. */
function warnApiError(error: ManagementApiError, message: string, hint?: string): void {
  const { hint: _credentialHint, ...body } = toRenderedError(error).body;
  writeWarning({ ...body, message, ...(hint === undefined ? {} : { hint }) });
}

/**
 * The name of every team the token sees, by id. When the API does not give
 * them, a warning says so and the entries are written without `teamName`.
 */
export async function readTeamNames(client: ManagementClient): Promise<Map<number, string>> {
  try {
    const teams = await everyPage((query) => getApiV2Teams({ client, query }), { page: 1 });
    return new Map(teams.map((team) => [team.id, team.name]));
  } catch (error) {
    if (!(error instanceof ManagementApiError)) throw error;
    warnApiError(
      error,
      `The team names could not be read, the entries are written without teamName: ${error.message}`,
    );
    return new Map();
  }
}

export function cloudOf(project: Project, teams: Map<number, string>): CloudIdentifiers {
  const teamName = teams.get(project.teamId);
  return {
    id: project.id,
    teamId: project.teamId,
    ...(teamName === undefined ? {} : { teamName }),
  };
}

/**
 * The project's master key, which the API gives to the owners of its team or
 * organization only. A 403 is a warning naming the entry left without a key;
 * any other error stops the command.
 */
export async function readMasterKey(
  client: ManagementClient,
  project: Project,
  entry: string,
): Promise<string | undefined> {
  try {
    const answer = await getApiV2ProjectsByProjectIdMasterKey({
      client,
      path: { projectId: project.id },
    });
    return answer.masterKey;
  } catch (error) {
    if (!(error instanceof ManagementApiError) || error.status !== 403) throw error;
    warnApiError(
      error,
      `No master key for project ${project.id} (${project.name}): only an owner of its team or organization can read it.`,
      `Ask an owner of the team for a key, then run \`meili config update --project ${entry} --project-api-key -\`.`,
    );
    return undefined;
  }
}

/**
 * The entry `config set` and `config update` write with `--sync-with-cloud`:
 * the key given or already there, else the master key, and the project's
 * cloud identifiers.
 */
export async function cloudEntry(
  client: ManagementClient,
  project: Project,
  name: string,
  url: string,
  apiKey: string | undefined,
): Promise<ProjectEntry> {
  return {
    url,
    apiKey: apiKey ?? (await readMasterKey(client, project, name)),
    cloud: cloudOf(project, await readTeamNames(client)),
  };
}

/** Same scheme, host and port. */
export function sameOrigin(a: string, b: string): boolean {
  const origin = parseUrl(a)?.origin;
  return origin !== undefined && origin === parseUrl(b)?.origin;
}

/** An entry whose URL is not its project's is an anomaly, reported and not corrected. */
export function warnUrlAnomaly(name: string, url: string, project: Project): void {
  if (project.url == null || sameOrigin(url, project.url)) return;
  writeWarning(
    new MeiliCliError(
      "cli_config",
      `The URL of \`${name}\`, ${url}, is not the URL Meilisearch Cloud gives for project ${project.id}, ${project.url}. The entry keeps its URL.`,
    ),
  );
}

/** The statuses a project creation stops at: the project serves, or its creation failed. */
const FINAL_PROJECT_STATUSES: ReadonlySet<string> = new Set(["running", "failed"]);

/**
 * Polls `GET /api/v2/projects/{id}` until `running` or `failed`, 1 s apart
 * growing to 5 s: creating a project takes minutes. The project comes back
 * without its master key. Throws `cli_timeout` when the deadline passes.
 */
export function waitForProject(
  client: ManagementClient,
  id: number,
  options: Pick<PollOptions<Project>, "timeoutMs" | "onProgress">,
): Promise<Project> {
  return pollUntil(
    () => getApiV2ProjectsById({ client, path: { id } }),
    (current) => FINAL_PROJECT_STATUSES.has(current.status),
    () =>
      new MeiliCliError(
        "cli_timeout",
        `Project ${id} did not reach status running or failed within ${formatDuration(options.timeoutMs)}. Its creation goes on on the server.`,
        { hint: `Run \`meili project view --id ${id}\` to check its status.` },
      ),
    { ...options, initialIntervalMs: 1000, maxIntervalMs: 5000 },
  );
}
