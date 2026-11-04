import { Errors, Flags } from "@oclif/core";
import { type Meilisearch, MeilisearchApiError } from "meilisearch";
import { type Api, BaseCommand } from "../lib/base-command.js";
import {
  getApiV2Me,
  getApiV2Regions,
  getApiV2Resources,
  getApiV2Teams,
  postApiV2Projects,
} from "../lib/clients/management/generated/sdk.gen.js";
import type { Project, Resource, Team } from "../lib/clients/management/generated/types.gen.js";
import { probeExport, triggerExport } from "../lib/clients/meilisearch.js";
import { cloudOf, everyPage, type ReachableProject, waitForProject } from "../lib/cloud-sync.js";
import { assertNoProject, type ConfigFile, isProjectUrl, writeConfigFile } from "../lib/config.js";
import {
  ManagementApiError,
  MeiliCliError,
  parseErrorBody,
  toRenderedError,
} from "../lib/errors.js";
import { logInWithBrowser } from "../lib/login.js";
import { resolveOauthClient } from "../lib/session.js";
import { isTaskFailure, isTaskFinal, pollUntil } from "../lib/tasks.js";
import { ask, askSecret, bar, choose, elapsed, endStatus, say, status } from "../lib/terminal.js";

const PRICING_URL = "https://www.meilisearch.com/pricing";
const SUPPORT = "support@meilisearch.com";

/** The answers of `POST /api/v2/projects` to an organization without a payment method or an address. */
const BILLING_ERRORS: ReadonlySet<string> = new Set([
  "project_billing_information_missing",
  "project_payment_method_missing",
  "project_billing_address_missing",
]);

/** The rule of Meilisearch Cloud for a project name. */
const PROJECT_NAME = /^.{3,40}$/;

/** The waits on the data have no deadline: the human sees them progress and stops them with Ctrl-C. */
const NO_DEADLINE = Number.POSITIVE_INFINITY;
const NEVER = () => new MeiliCliError("cli_internal", "A wait without a deadline timed out.");

/** What an agent runs in place of `teleport`. */
const WITHOUT_TELEPORT =
  "Run `meili auth login`, then `meili add projects --name <name> --team-id <id> --resource-id <id> --sync-config --wait`, then `meili export --project <source> --project-destination <name> --wait`, then `meili get tasks --project <name> --statuses enqueued,processing` until it lists no task.";

/** The project whose data moves, and how to reach it. `name` is its entry in the config file, if any. */
interface Source {
  name: string | undefined;
  url: string;
  client: Meilisearch;
}

export default class Teleport extends BaseCommand {
  static api: Api = "none";

  static override description =
    `Move the data of a Meilisearch project to a new Meilisearch Cloud project, by asking questions on the terminal. For humans only: an agent never runs it.

It checks that the source can export, logs in to Meilisearch Cloud, creates a project in the region, team and plan chosen, adds it to the config file, exports the data to it, and waits until the new project has indexed it. It refuses to run without a terminal.

An agent does the same without questions. ${WITHOUT_TELEPORT}`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --project local",
  ];

  static override flags = {
    project: Flags.string({
      description:
        "A project of the config file, the one whose data moves to Meilisearch Cloud. Without it, the command asks.",
      helpValue: "<name>",
    }),
  };

  /** The Cloud project created so far, said when the command stops halfway. */
  private created:
    | { name: string; link: string; sourceName: string | undefined; inConfigFile: boolean }
    | undefined;

  async run(): Promise<void> {
    const { flags } = await this.parse(Teleport);
    if (process.stdin.isTTY !== true || process.stderr.isTTY !== true) {
      throw new MeiliCliError(
        "cli_usage",
        "`meili teleport` asks questions, so it runs only in a terminal, for a human.",
        { hint: WITHOUT_TELEPORT },
      );
    }
    const onInterrupt = () => {
      this.sayWhatExists();
      process.exit(130);
    };
    process.once("SIGINT", onInterrupt);
    try {
      await this.teleport(flags.project);
    } finally {
      process.removeListener("SIGINT", onInterrupt);
    }
  }

  private async teleport(named: string | undefined): Promise<void> {
    const file = this.configFile();
    const source = await this.chooseSource(file, named);
    await this.logIn();
    const client = this.managementClient;
    const dashboard = resolveOauthClient(this.env).dashboardUrl;

    const [regions, teams] = await Promise.all([
      everyPage((query) => getApiV2Regions({ client, query }), { page: 1 }),
      everyPage((query) => getApiV2Teams({ client, query }), { page: 1 }),
    ]);
    const regionId = await choose(
      "Region of the new project",
      regions.map((region) => ({ name: region.name, value: region.id })),
    );
    const team = await chooseTeam(teams);

    const created = await this.createProject(
      file,
      await askName(file, `${source.name ?? "meilisearch"}-cloud`),
      team,
      regionId,
      dashboard,
    );
    // The entry of the config file takes the name of the project.
    const { name } = created;
    const link = `${dashboard}/teams/${team.id}/projects/${created.id}`;
    this.created = { name, link, sourceName: source.name, inConfigFile: false };

    say(`While Meilisearch Cloud creates ${name}, see the plans and prices at ${PRICING_URL}`);
    const start = Date.now();
    const project = await waitForProject(client, created.id, {
      timeoutMs: this.waitTimeoutMs({}),
      onProgress: (current) => status(`Creating ${name}: ${current.status}, ${elapsed(start)}`),
    });
    endStatus();
    if (project.status === "failed" || project.url == null) {
      throw new MeiliCliError(
        "cli_task_failed",
        `Meilisearch Cloud could not create project ${project.name}.`,
        { hint: `Contact ${SUPPORT} and give the project id, ${project.id}.` },
      );
    }

    this.addToConfigFile({ ...project, url: project.url }, created.masterKey, teams);
    this.created.inConfigFile = true;
    say(`Project ${name} is running, and is in the config file as \`${name}\`.`);

    say(`Sending the data of ${source.name ?? source.url} to ${name}.`);
    const task = await triggerExport(source.client, {
      url: project.url,
      apiKey: created.masterKey,
    });
    await followExport(source.client, task.taskUid);
    const destination = this.meilisearchClient(project.url, created.masterKey);
    await followIndexing(destination, name);

    const [index] = (await destination.getIndexes({ limit: 1 })).results;
    say();
    say(`Your data is in Meilisearch Cloud, in project ${name}.`);
    if (index !== undefined) {
      say(`Search it:     meili search --project ${name} --index ${index.uid} --q "<query>"`);
    }
    say(`Try it:        ${link}/preview`);
    say(`Its settings:  ${link}/settings/general`);
  }

  /** The source named, else the one chosen, once its key can call `POST /export`. */
  private async chooseSource(file: ConfigFile, named: string | undefined): Promise<Source> {
    let name = named;
    for (;;) {
      const source = await this.pickSource(file, name);
      name = undefined;
      const problem = await exportProblem(source.client);
      if (problem === undefined) return source;
      say(`${source.name ?? source.url} cannot export. ${problem}`);
    }
  }

  private async pickSource(file: ConfigFile, name: string | undefined): Promise<Source> {
    const entry = name === undefined ? undefined : file.projects[name];
    if (entry !== undefined) {
      return { name, url: entry.url, client: this.meilisearchClient(entry.url, entry.apiKey) };
    }
    if (name !== undefined) say(`No project \`${name}\` in ${file.path}.`);
    const names = Object.keys(file.projects);
    const picked =
      names.length === 0
        ? null
        : await choose<string | null>("Which project moves to Meilisearch Cloud?", [
            ...names.map((each) => ({ name: `${each}  ${file.projects[each]?.url}`, value: each })),
            { name: "Another one: enter its URL and its API key", value: null },
          ]);
    if (picked !== null) return this.pickSource(file, picked);
    const url = await ask("URL of the Meilisearch instance", {
      validate: (value) =>
        isProjectUrl(value) || "Enter an HTTP(S) URL, for example http://localhost:7700.",
    });
    const apiKey = await askSecret("Its API key, with the export action (empty when it has none)");
    return { name: undefined, url, client: this.meilisearchClient(url, apiKey || undefined) };
  }

  /** Connects with the stored session, or logs in with the browser first. */
  private async logIn(): Promise<void> {
    let me = await this.loggedInUser();
    if (me === undefined) {
      say("Log in to Meilisearch Cloud in your browser. Without an account, you create one there.");
      await logInWithBrowser(this.env, true);
      await this.connectManagement();
      me = await getApiV2Me({ client: this.managementClient });
    }
    say(`Logged in to Meilisearch Cloud as ${me.email}.`);
  }

  /** The user of the stored session, or undefined when there is none or the server refuses it. */
  private async loggedInUser(): Promise<{ email: string } | undefined> {
    try {
      await this.connectManagement();
      return await getApiV2Me({ client: this.managementClient });
    } catch (error) {
      const refused =
        error instanceof MeiliCliError
          ? error.code === "cli_auth_missing" || error.code === "cli_auth_failed"
          : error instanceof ManagementApiError && error.status === 401;
      if (refused) return undefined;
      throw error;
    }
  }

  /**
   * `POST /api/v2/projects` on the free trial of the region, else on the plan
   * chosen. A name the team already has asks for another one.
   */
  private async createProject(
    file: ConfigFile,
    firstName: string,
    team: Team,
    regionId: number,
    dashboard: string,
  ): Promise<Project> {
    const client = this.managementClient;
    const resources = await everyPage(
      (query) => getApiV2Resources({ client, query: { ...query, regionId } }),
      { page: 1 },
    );
    let name = firstName;
    let resourceId =
      resources.find((resource) => resource.plan === "free_trial")?.id ??
      (await choosePlan(resources, "This region has no free trial."));
    for (;;) {
      try {
        return await postApiV2Projects({ client, body: { name, teamId: team.id, resourceId } });
      } catch (error) {
        const code = apiErrorCode(error);
        if (code === "user_not_entitled_to_free_trial") {
          resourceId = await choosePlan(resources, "Your free trial is already used.");
          continue;
        }
        if (code === "project_create_name_exists") {
          say(`Team ${team.name} already has a project ${name}.`);
          name = await askName(file, name);
          continue;
        }
        if (code !== undefined && BILLING_ERRORS.has(code)) {
          say(
            `Add a payment method and an address at ${dashboard}/teams/${team.id}/billing, then run \`meili teleport\` again.`,
          );
        }
        if (code === "organization_not_self_serve") {
          say(`Contact ${SUPPORT} to create a project in this organization.`);
        }
        throw error;
      }
    }
  }

  /** Adds the project as an entry named after it, as `add projects --sync-config` does. */
  private addToConfigFile(
    project: ReachableProject,
    apiKey: string | undefined,
    teams: Team[],
  ): void {
    const { name, url } = project;
    try {
      // Read again: the human may have changed the file while the project was created.
      const file = this.configFile();
      assertNoProject(file, name, `: project ${project.id} is created but was not added to it.`);
      const cloud = cloudOf(project, new Map(teams.map((team) => [team.id, team.name])));
      writeConfigFile({
        path: file.path,
        projects: { ...file.projects, [name]: { url, apiKey, cloud } },
      });
    } catch (error) {
      say(
        `Once the config file is fixed, run \`meili config sync-with-cloud --project-name ${name}\` to add the project to it, then \`meili export --project-destination ${name}\` to send the data.`,
      );
      throw error;
    }
  }

  /** Without a terminal, an agent reads the error: the JSON of the contract. With one, a human reads it. */
  protected override async catch(error: unknown): Promise<never> {
    if (process.stderr.isTTY !== true || error instanceof Errors.ExitError) {
      return super.catch(error);
    }
    endStatus();
    // Ctrl-C on a question.
    if (error instanceof Error && error.name === "ExitPromptError") {
      this.sayWhatExists();
      this.exit(130);
    }
    const { body, exitCode } = toRenderedError(error);
    say();
    say(`Error: ${body.message}`);
    if (body.hint !== undefined) say(body.hint);
    this.sayWhatExists();
    this.exit(exitCode);
  }

  private sayWhatExists(): void {
    if (this.created === undefined) return;
    say(`Project ${this.created.name} exists in Meilisearch Cloud: ${this.created.link}`);
    const { name, sourceName, inConfigFile } = this.created;
    if (inConfigFile) {
      say(
        `It is in the config file. To send the data again, run \`meili export --project ${sourceName ?? "<source>"} --project-destination ${name} --wait\`.`,
      );
    }
  }
}

/** Why the source cannot export, or undefined when it can. */
async function exportProblem(client: Meilisearch): Promise<string | undefined> {
  try {
    await probeExport(client);
    return undefined;
  } catch (error) {
    const status = error instanceof MeilisearchApiError ? error.response.status : undefined;
    if (status === 401 || status === 403) {
      return "The API key is missing or wrong, or it lacks the `export` action. Use the master key, or a key with the `export` action.";
    }
    if (status === 404) {
      return "It has no export route: export needs Meilisearch v1.16 or later. Upgrade the instance, or check the URL.";
    }
    return toRenderedError(error).body.message;
  }
}

async function chooseTeam(teams: Team[]): Promise<Team> {
  const [only] = teams;
  if (only !== undefined && teams.length === 1) {
    say(`Team: ${only.name}.`);
    return only;
  }
  return choose(
    "Team of the new project",
    teams.map((team) => ({ name: team.name, value: team })),
  );
}

/** A name Meilisearch Cloud accepts and the config file does not have yet. */
function askName(file: ConfigFile, suggested: string): Promise<string> {
  return ask("Name of the new project", {
    default: suggested,
    validate: (value) =>
      !PROJECT_NAME.test(value)
        ? "A project name has 3 to 40 characters."
        : file.projects[value] !== undefined
          ? `The config file already has a project \`${value}\`.`
          : true,
  });
}

function choosePlan(resources: Resource[], why: string): Promise<number> {
  say(`${why} Choose a plan. Prices: ${PRICING_URL}`);
  return choose(
    "Plan of the new project",
    resources
      .filter((resource) => resource.plan !== "free_trial")
      .map((resource) => ({ name: describeResource(resource), value: resource.id })),
  );
}

/** `Build: 2 vCPU, 1 GB RAM, 50 GB storage`. */
function describeResource(resource: Resource): string {
  const size = [
    resource.vcpu == null ? undefined : `${resource.vcpu} vCPU`,
    resource.memory == null ? undefined : `${resource.memory} GB RAM`,
    resource.storage == null ? undefined : `${resource.storage} GB storage`,
  ].filter((part) => part !== undefined);
  return `${resource.displayName ?? resource.name}: ${size.join(", ")}`;
}

/** The `code` of a Management API error body. */
function apiErrorCode(error: unknown): string | undefined {
  return error instanceof ManagementApiError ? parseErrorBody(error.body)?.code : undefined;
}

/** Follows the export task of the source, with the progress of its batch. */
async function followExport(client: Meilisearch, uid: number): Promise<void> {
  const show = (percentage: number) => status(`Sending   ${bar(percentage / 100)}`);
  const final = await pollUntil(
    async () => {
      const task = await client.tasks.getTask(uid);
      const batch =
        task.status === "processing" && task.batchUid !== null
          ? await client.batches.getBatch(task.batchUid)
          : undefined;
      return { task, percentage: batch?.progress?.percentage ?? 0 };
    },
    ({ task }) => isTaskFinal(task),
    NEVER,
    { timeoutMs: NO_DEADLINE, onProgress: ({ percentage }) => show(percentage) },
  );
  if (isTaskFailure(final.task)) {
    endStatus();
    throw new MeiliCliError(
      "cli_task_failed",
      `The export failed: ${final.task.error?.message ?? final.task.status}.`,
    );
  }
  show(100);
  endStatus();
}

/**
 * Follows the tasks of the new project until none is left to process. The
 * project is new, so every task of it comes from the export.
 */
async function followIndexing(client: Meilisearch, entry: string): Promise<void> {
  // The export is over, so the total no longer grows: only what is left is polled.
  const { total } = await client.tasks.getTasks({ limit: 1 });
  const show = (left: number) =>
    status(
      `Indexing  ${bar(total === 0 ? 1 : (total - left) / total)}  ${total - left}/${total} tasks`,
    );
  await pollUntil(
    async () =>
      (await client.tasks.getTasks({ statuses: ["enqueued", "processing"], limit: 1 })).total,
    (left) => left === 0,
    NEVER,
    { timeoutMs: NO_DEADLINE, maxIntervalMs: 2000, onProgress: show },
  );
  show(0);
  endStatus();
  const failed = await client.tasks.getTasks({ statuses: ["failed"] });
  if (failed.total === 0) return;
  for (const task of failed.results) {
    say(`Task ${task.uid} (${task.type}) failed: ${task.error?.message ?? "no error message"}`);
  }
  throw new MeiliCliError(
    "cli_task_failed",
    `${failed.total === 1 ? "1 task" : `${failed.total} tasks`} failed in project ${entry}.`,
    {
      hint: `Run \`meili get tasks --project ${entry} --statuses failed\` to see them.`,
    },
  );
}
