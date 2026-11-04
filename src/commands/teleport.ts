import { Errors, Flags } from "@oclif/core";
import { type Meilisearch, MeilisearchApiError } from "meilisearch";
import { type Api, BaseCommand } from "../lib/base-command.js";
import {
  getApiV2Me,
  getApiV2Organizations,
  getApiV2Regions,
  getApiV2Resources,
  getApiV2Teams,
  postApiV2Projects,
} from "../lib/clients/management/generated/sdk.gen.js";
import type {
  Organization,
  Project,
  Region,
  Resource,
  Team,
} from "../lib/clients/management/generated/types.gen.js";
import { probeExport, triggerExport } from "../lib/clients/meilisearch.js";
import { regionLatency } from "../lib/clients/ping.js";
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
import {
  ask,
  askSecret,
  bar,
  choose,
  detail,
  elapsed,
  endStatus,
  field,
  heading,
  isPromptExit,
  paint,
  problem,
  say,
  status,
  step,
} from "../lib/terminal.js";

const PRICING_URL = "https://www.meilisearch.com/pricing";
const SUPPORT = "support@meilisearch.com";

/** Shown in turn while Meilisearch Cloud creates the project, `<name>` replaced by its name. */
const TIPS = [
  `Choose the best plan for your usage: ${PRICING_URL}`,
  "Meilisearch Cloud upgrades your project to new Meilisearch versions automatically, at the time you schedule.",
  "`meili get indexes --project <name>` lists the indexes of the project.",
  "Monitor and manage your project from the Meilisearch Cloud dashboard.",
  "`meili get tasks --project <name> --statuses enqueued,processing` lists the tasks not finished yet.",
  "Meilisearch Cloud shows the usage analytics of your project, like the most searched queries.",
  "`meili get stats --project <name>` shows the number of documents of each index.",
  "`meili get tasks --project <name> --statuses failed` lists the tasks that failed.",
  "`meili config list` shows the projects of your config file.",
];
const TIP_MS = 8000;

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
    `Move the data of a Meilisearch project to a new Meilisearch Cloud project, by asking questions on the terminal. An interactive command, for humans: an agent never runs it.

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
    | {
        name: string;
        link: string;
        sourceName: string | undefined;
        inConfigFile: boolean;
        transferring: boolean;
      }
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
      endStatus();
      // The export is enqueued: the transfer goes on without the CLI.
      if (this.created?.transferring === true) {
        say();
        say(
          `⏳ ${paint("bold", "The transfer continues in Meilisearch Cloud. meili CLI stopped watching it.")}`,
        );
        say();
        field("Watch it", `${this.created.link}/batches`);
        sayLinks(this.created.link);
        void this.exitNow(0);
        return;
      }
      this.sayWhatExists();
      void this.exitNow(130);
    };
    process.once("SIGINT", onInterrupt);
    try {
      await this.teleport(flags.project);
    } finally {
      process.removeListener("SIGINT", onInterrupt);
    }
  }

  private async teleport(named: string | undefined): Promise<void> {
    say(
      `${paint("bold", "meili teleport")} ${paint("dim", "· move your data to Meilisearch Cloud")}`,
    );
    say();
    const file = this.configFile();
    const source = await this.chooseSource(file, named);
    await this.logIn();
    const client = this.managementClient;
    const dashboard = resolveOauthClient(this.env).dashboardUrl;

    status(() => "Loading the regions, the organizations and the teams");
    const [regions, organizations, teams] = await Promise.all([
      everyPage((query) => getApiV2Regions({ client, query }), { page: 1 }),
      everyPage((query) => getApiV2Organizations({ client, query }), { page: 1 }),
      everyPage((query) => getApiV2Teams({ client, query }), { page: 1 }),
    ]);
    const region = await choose("region", "Region of the new project", await closestFirst(regions));
    step("Region", region.name);
    const team = await chooseTeam(organizations, teams);

    const created = await this.createProject(
      file,
      await askName(file, `${source.name ?? "meilisearch"}-cloud`),
      team,
      region.id,
      dashboard,
    );
    // The entry of the config file takes the name of the project.
    const { name } = created;
    const link = `${dashboard}/teams/${team.id}/projects/${created.id}`;
    this.created = {
      name,
      link,
      sourceName: source.name,
      inConfigFile: false,
      transferring: false,
    };

    const start = Date.now();
    let current = created.status;
    const creating = () => {
      const tip = TIPS[Math.floor((Date.now() - start) / TIP_MS) % TIPS.length] as string;
      return `Creating ${name}: ${current}. It can take several minutes.  ${paint("dim", elapsed(start))}
${paint("dim", `Tip: ${tip.replaceAll("<name>", name)}`)}`;
    };
    status(creating);
    const project = await waitForProject(client, created.id, {
      timeoutMs: this.waitTimeoutMs({}),
      onProgress: (each) => {
        current = each.status;
      },
    });
    if (project.status === "failed" || project.url == null) {
      throw new MeiliCliError(
        "cli_task_failed",
        `Meilisearch Cloud could not create project ${project.name}.`,
        { hint: `Contact ${SUPPORT} and give the project id, ${project.id}.` },
      );
    }

    this.addToConfigFile({ ...project, url: project.url }, created.masterKey, teams);
    this.created.inConfigFile = true;
    step("Created", `${name} is running, in the config file as \`${name}\``, start);

    const task = await triggerExport(source.client, {
      url: project.url,
      apiKey: created.masterKey,
    });
    this.created.transferring = true;
    await followExport(source.client, task.taskUid, source.name ?? source.url);
    const destination = this.meilisearchClient(project.url, created.masterKey);
    await followIndexing(destination, name);

    const [index] = (await destination.getIndexes({ limit: 1 })).results;
    say();
    say(
      `✨ ${paint("bold", `Done in ${elapsed(start)}: your data is in Meilisearch Cloud, in project ${name}.`)}`,
    );
    say();
    if (index !== undefined) {
      field("Search", `meili search --project ${name} --index ${index.uid} --q "<query>"`);
    }
    sayLinks(link);
  }

  /** The source named, else the one chosen, once its key can call `POST /export`. */
  private async chooseSource(file: ConfigFile, named: string | undefined): Promise<Source> {
    let name = named;
    for (;;) {
      const source = await this.pickSource(file, name);
      name = undefined;
      const why = await exportProblem(source.client);
      if (why === undefined) {
        step("Source", source.name === undefined ? source.url : `${source.name}, ${source.url}`);
        return source;
      }
      problem(`${source.name ?? source.url} cannot export. ${why}`);
    }
  }

  private async pickSource(file: ConfigFile, name: string | undefined): Promise<Source> {
    const entry = name === undefined ? undefined : file.projects[name];
    if (entry !== undefined) {
      return { name, url: entry.url, client: this.meilisearchClient(entry.url, entry.apiKey) };
    }
    if (name !== undefined) problem(`No project \`${name}\` in ${file.path}.`);
    const names = Object.keys(file.projects);
    const picked =
      names.length === 0
        ? null
        : await choose<string | null>("source", "Which project moves to Meilisearch Cloud?", [
            ...names.map((each) => ({
              name: `${each}  ${file.projects[each]?.url}`,
              value: each,
              id: "config-entry",
            })),
            { name: "Another one: enter its URL and its API key", value: null, id: "enter-url" },
          ]);
    if (picked !== null) return this.pickSource(file, picked);
    const url = await ask("source-url", "URL of the Meilisearch instance", {
      validate: (value) =>
        isProjectUrl(value) || "Enter an HTTP(S) URL, for example http://localhost:7700.",
    });
    const apiKey = await askSecret(
      "source-api-key",
      "Its API key, with the export action (empty when it has none)",
    );
    return { name: undefined, url, client: this.meilisearchClient(url, apiKey || undefined) };
  }

  /** Connects with the stored session, or logs in with the browser first. */
  private async logIn(): Promise<void> {
    let me = await this.loggedInUser();
    if (me === undefined) {
      say("Log in to Meilisearch Cloud in your browser. Without an account, you create one there.");
      await logInWithBrowser(this.env, true, this.userAgent, detail);
      await this.connectManagement();
      me = await getApiV2Me({ client: this.managementClient });
    }
    step("Logged in", me.email);
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
    const trialId = resources.find((resource) => resource.plan === "free_trial")?.id;
    let resourceId = trialId ?? (await choosePlan(resources, "This region has no free trial."));
    for (;;) {
      try {
        const project = await postApiV2Projects({
          client,
          body: { name, teamId: team.id, resourceId },
        });
        const plan =
          resourceId === trialId
            ? "free trial, free for 14 days"
            : `plan ${resources.find((resource) => resource.id === resourceId)?.name}`;
        step("Project", `${name}, ${plan}`);
        return project;
      } catch (error) {
        const code = apiErrorCode(error);
        if (code === "user_not_entitled_to_free_trial") {
          resourceId = await choosePlan(resources, "Your free trial is already used.");
          continue;
        }
        if (code === "project_create_name_exists") {
          problem(`Team ${team.name} already has a project ${name}.`);
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
    if (isPromptExit(error)) {
      this.sayWhatExists();
      this.exit(130);
    }
    const { body, exitCode } = toRenderedError(error);
    say();
    problem(`Error: ${body.message}`);
    if (body.hint !== undefined) detail(body.hint);
    this.sayWhatExists();
    this.exit(exitCode);
  }

  private sayWhatExists(): void {
    if (this.created === undefined) return;
    detail(`Project ${this.created.name} exists in Meilisearch Cloud: ${this.created.link}`);
    const { name, sourceName, inConfigFile } = this.created;
    if (inConfigFile) {
      detail(
        `It is in the config file. To send the data again, run \`meili export --project ${sourceName ?? "<source>"} --project-destination ${name} --wait\`.`,
      );
    }
  }
}

/** The links to the project in the dashboard. */
function sayLinks(link: string): void {
  field("Try it", `${link}/preview`);
  field("Project settings", `${link}/settings/general`);
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

/**
 * The regions as the dashboard shows them: the closest first, then by latency,
 * with a 🌱 on a green label region. A region that does not answer comes last.
 */
async function closestFirst(
  regions: Region[],
): Promise<Array<{ name: string; value: Region; id: string }>> {
  const measured = await Promise.all(
    regions.map(async (region) => ({ region, latency: await regionLatency(region.regionUrl) })),
  );
  measured.sort(
    (a, b) => (a.latency ?? Number.POSITIVE_INFINITY) - (b.latency ?? Number.POSITIVE_INFINITY),
  );
  const width = Math.max(...regions.map((region) => region.name.length)) + 3;
  return measured.map(({ region, latency }, index) => {
    const name = `${region.name}${region.greenLabel ? " 🌱" : ""}`.padEnd(width);
    const ms = latency === undefined ? "" : `${String(latency).padStart(4)}ms`;
    const closest = index === 0 && latency !== undefined ? "  (closest)" : "";
    return { name: `${name}${ms}${closest}`.trimEnd(), value: region, id: region.name };
  });
}

/** The team of the new project, asked only when there are several, grouped by organization. */
async function chooseTeam(organizations: Organization[], teams: Team[]): Promise<Team> {
  const [only] = teams;
  const team =
    only !== undefined && teams.length === 1
      ? only
      : await choose(
          "team",
          "Team of the new project",
          organizations.flatMap((organization) => {
            const its = teams.filter((each) => each.organizationId === organization.id);
            return its.length === 0
              ? []
              : [
                  heading(organization.name),
                  ...its.map((each) => ({ name: `  ${each.name}`, value: each })),
                ];
          }),
        );
  const organization = organizations.find((each) => each.id === team.organizationId);
  step("Team", organization === undefined ? team.name : `${team.name} (${organization.name})`);
  return team;
}

/** A name Meilisearch Cloud accepts and the config file does not have yet. */
function askName(file: ConfigFile, suggested: string): Promise<string> {
  return ask("project-name", "Name of the new project", {
    default: suggested,
    validate: (value) =>
      !PROJECT_NAME.test(value)
        ? "A project name has 3 to 40 characters."
        : file.projects[value] !== undefined
          ? `The config file already has a project \`${value}\`.`
          : true,
  });
}

/** The plans offered when the free trial is not, in this order. Any other plan comes after them. */
const PLAN_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "4XL", "8XL"];

/** The plans that show a monthly estimation, in `PLAN_ORDER`, except the Build plan: it is never offered here. */
function choosePlan(resources: Resource[], why: string): Promise<number> {
  say(`${why} Get help to choose the right plan based on your usage here: ${PRICING_URL}`);
  const rank = (resource: Resource) => {
    const index = PLAN_ORDER.indexOf(resource.name);
    return index === -1 ? PLAN_ORDER.length : index;
  };
  const priced = resources.flatMap((resource) => {
    const estimation = resource.name === "Build" ? undefined : monthlyEstimation(resource);
    return estimation === undefined ? [] : [{ resource, estimation }];
  });
  return choose(
    "plan",
    "Plan of the new project",
    priced
      .sort((a, b) => rank(a.resource) - rank(b.resource))
      .map(({ resource, estimation }) => ({
        name: describeResource(resource, estimation),
        value: resource.id,
        id: resource.name,
      })),
  );
}

/**
 * What the dashboard shows as the monthly price of a resource: the estimation
 * of the first feature of its plan billed per month or per hour of runtime.
 */
function monthlyEstimation(resource: Resource): number | undefined {
  return (
    resource.fullPlan?.features.find(
      (feature) => feature.kind === "base" || feature.kind === "instance_runtime",
    )?.monthlyEstimation ?? undefined
  );
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** `XS: 0.5 vCPU, 1 GB RAM, 50 GB storage, about $21.90 a month (recommended for development only)`. */
function describeResource(resource: Resource, estimation: number): string {
  const size = [
    resource.vcpu == null ? undefined : `${resource.vcpu} vCPU`,
    resource.memory == null ? undefined : `${resource.memory} GB RAM`,
    resource.storage == null ? undefined : `${resource.storage} GB storage`,
  ].filter((part) => part !== undefined);
  const note = resource.name === "XS" ? " (recommended for development only)" : "";
  return `${resource.name}: ${[...size, `about ${USD.format(estimation)} a month`].join(", ")}${note}`;
}

/** The `code` of a Management API error body. */
function apiErrorCode(error: unknown): string | undefined {
  return error instanceof ManagementApiError ? parseErrorBody(error.body)?.code : undefined;
}

/** Follows the export task of the source, with the progress of its batch. */
async function followExport(client: Meilisearch, uid: number, label: string): Promise<void> {
  const start = Date.now();
  let percentage = 0;
  status(() => `Sending   ${bar(percentage / 100)}  ${paint("dim", elapsed(start))}`);
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
    {
      timeoutMs: NO_DEADLINE,
      onProgress: (current) => {
        percentage = current.percentage;
      },
    },
  );
  if (isTaskFailure(final.task)) {
    throw new MeiliCliError(
      "cli_task_failed",
      `The export failed: ${final.task.error?.message ?? final.task.status}.`,
    );
  }
  step("Sent", `the data of ${label}`, start);
}

const tasks = (count: number) => (count === 1 ? "1 task" : `${count} tasks`);

/**
 * Follows the tasks of the new project until none is left to process. The
 * project is new, so every task of it comes from the export.
 */
async function followIndexing(client: Meilisearch, entry: string): Promise<void> {
  const start = Date.now();
  // The export is over, so the total no longer grows: only what is left is polled.
  const { total } = await client.tasks.getTasks({ limit: 1 });
  let left = total;
  status(
    () =>
      `Indexing  ${bar(total === 0 ? 1 : (total - left) / total)}  ${total - left}/${total} tasks  ${paint("dim", elapsed(start))}`,
  );
  await pollUntil(
    async () =>
      (await client.tasks.getTasks({ statuses: ["enqueued", "processing"], limit: 1 })).total,
    (count) => count === 0,
    NEVER,
    {
      timeoutMs: NO_DEADLINE,
      maxIntervalMs: 2000,
      onProgress: (count) => {
        left = count;
      },
    },
  );
  left = 0;
  const failed = await client.tasks.getTasks({ statuses: ["failed"] });
  if (failed.total === 0) {
    step("Indexed", tasks(total), start);
    return;
  }
  for (const task of failed.results) {
    problem(`Task ${task.uid} (${task.type}) failed: ${task.error?.message ?? "no error message"}`);
  }
  throw new MeiliCliError("cli_task_failed", `${tasks(failed.total)} failed in project ${entry}.`, {
    hint: `Run \`meili get tasks --project ${entry} --statuses failed\` to see them.`,
  });
}
