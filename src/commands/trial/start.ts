import { basename } from "node:path";
import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import {
  createProject,
  listRegions,
  listResources,
} from "../../lib/clients/management/generated/sdk.gen.js";
import type { Project } from "../../lib/clients/management/generated/types.gen.js";
import {
  byLatency,
  cloudEntry,
  everyPage,
  listCloudProjects,
  readTeamNames,
  waitForProject,
} from "../../lib/cloud-sync.js";
import { assertNoProject, entriesOfCloudId, writeConfigFile } from "../../lib/config.js";
import { apiErrorCode, ManagementApiError, MeiliCliError, writeNotice } from "../../lib/errors.js";
import { done, projectBrief } from "../../lib/human.js";
import { paint } from "../../lib/output.js";
import { resolveOauthClient } from "../../lib/session.js";

export default class TrialStart extends BaseCommand {
  static api: Api = "none";

  static override description = `Start a free 14-day trial of Meilisearch Cloud.

Logs in with a browser when no session exists, creating an account if needed. Then creates a free trial project, waits until it runs, and adds it to the config file with its master key. Prints the project, and never its master key. When a free trial project already exists, prints it with "created": false and creates nothing.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --name my-app --region-id 2",
    "<%= config.bin %> <%= command.id %> --team-id 12",
    "<%= config.bin %> <%= command.id %> --no-login",
  ];

  static override flags = {
    name: Flags.string({
      description: "Name of the project. Default: the name of the current directory.",
      helpValue: "<name>",
    }),
    "team-id": Flags.integer({
      description: "Team that owns the project. Required when the account has several teams.",
      helpValue: "<id>",
    }),
    "region-id": Flags.integer({
      description: "Region of the project. Default: the closest region that offers a free trial.",
      helpValue: "<id>",
    }),
    login: Flags.boolean({
      default: true,
      allowNo: true,
      description:
        "Log in with a browser when no session exists. --no-login fails with cli_auth_missing instead.",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TrialStart);
    // Before anything is created: a Cloud named by one URL only is a usage error.
    const { dashboardUrl: dashboard } = resolveOauthClient(this.env);
    await this.logIn(flags.login);
    const client = this.managementClient;

    const existing = (await listCloudProjects(client)).find(isActiveTrial);
    // Only the creation returns the master key. The project printed comes from
    // a list or a GET, so it never carries it.
    const start = existing ?? (await this.create(flags));
    const project =
      existing?.status === "running"
        ? existing
        : await this.watch(
            `Project ${start.id}`,
            {
              next: [
                `${paint("dim", "It is still being created. Run the same command again to wait for it:")} meili trial start`,
              ],
            },
            (onProgress) =>
              waitForProject(client, start.id, { timeoutMs: this.waitTimeoutMs({}), onProgress }),
          );
    if (project.status === "failed" || project.url == null) {
      throw new MeiliCliError(
        "cli_task_failed",
        `Meilisearch Cloud could not create project ${project.name}.`,
        { hint: `Contact support@meilisearch.com and give the project id, ${project.id}.` },
      );
    }

    // An entry named after the project, with its master key, unless the file has one.
    const file = this.configFile();
    let configProject = entriesOfCloudId(file, project.id)[0];
    if (configProject === undefined) {
      configProject =
        file.projects[project.name] === undefined ? project.name : `${project.name}-${project.id}`;
      assertNoProject(file, configProject, `: project ${project.id} was not added to it.`);
      const entry = await cloudEntry(client, project, configProject, project.url, start.masterKey);
      writeConfigFile({ path: file.path, projects: { ...file.projects, [configProject]: entry } });
    }

    const dashboardUrl = `${dashboard}/teams/${project.teamId}/projects/${project.id}`;
    await this.output(
      { created: existing === undefined, configProject, dashboardUrl, project },
      () => ({
        status: [
          done(
            existing !== undefined
              ? `You already have a free trial project, ${project.name}. Nothing was created.`
              : `Free trial project ${project.name} is running.`,
          ),
          `The free trial ends at ${project.freeTrialEndsAt}.`,
        ],
        data: projectBrief(project),
        next: [
          `${paint("dim", `It is in the config file as ${configProject}. Use it:`)} meili index list -p ${configProject}`,
          `${paint("dim", "Dashboard:")} ${dashboardUrl}`,
        ],
      }),
    );
  }

  /** Uses the stored session, refreshed if needed, else logs in with a browser. */
  private async logIn(login: boolean): Promise<void> {
    let me = await this.loggedInUser();
    if (me === undefined) {
      if (!login) {
        throw new MeiliCliError("cli_auth_missing", "Nobody is logged in to Meilisearch Cloud.", {
          hint: "Run `meili auth login`, then run `meili trial start` again.",
        });
      }
      writeNotice("Opening your browser to log in or create a Meilisearch Cloud account.");
      me = await this.logInWithBrowser();
    }
    writeNotice(`Logged in as ${me.email}.`);
  }

  /** `POST /api/v2/projects` on the free trial resource of the region, for the team. */
  private async create(flags: {
    name: string | undefined;
    "team-id": number | undefined;
    "region-id": number | undefined;
  }): Promise<Project> {
    const client = this.managementClient;
    const name = flags.name ?? defaultName();
    const [teams, regions, resources] = await Promise.all([
      readTeamNames(client),
      everyPage((query) => listRegions({ client, query })),
      everyPage((query) => listResources({ client, query })),
    ]);
    const teamId = flags["team-id"] ?? onlyTeam(teams);
    const trials = resources.filter((resource) => resource.plan === "free_trial");
    const regionId =
      flags["region-id"] ??
      (await byLatency(regions.filter((region) => trials.some((t) => t.regionId === region.id))))[0]
        ?.region.id;
    const resource = trials.find((each) => each.regionId === regionId);
    if (resource === undefined) {
      throw new MeiliCliError("cli_usage", `Region ${regionId} offers no free trial.`, {
        hint: `Give --region-id with a region that offers one: ${trials.map((each) => each.regionId).join(", ")}. Run \`meili region list\` to see their names.`,
      });
    }
    const region = regions.find((each) => each.id === resource.regionId)?.name;
    writeNotice(
      `Creating free trial project ${name} in ${region}, for team ${teams.get(teamId) ?? teamId}.`,
    );
    try {
      return await createProject({ client, body: { name, teamId, resourceId: resource.id } });
    } catch (error) {
      if (
        error instanceof ManagementApiError &&
        apiErrorCode(error) === "user_not_entitled_to_free_trial"
      ) {
        throw new ManagementApiError(
          error.status,
          error.body,
          error.url,
          `Choose a plan at https://www.meilisearch.com/pricing, then run \`meili project add --name ${name} --team-id ${teamId} --resource-id <id> --sync-config --wait\`. \`meili resource list --region-id ${resource.regionId}\` lists the plans of the region.`,
        );
      }
      throw error;
    }
  }
}

/** A free trial project that is not terminated and not over: a second run returns it. */
function isActiveTrial(project: Project): boolean {
  return (
    project.resource.plan === "free_trial" &&
    project.terminatedAt == null &&
    (project.freeTrialEndsAt == null || Date.parse(project.freeTrialEndsAt) > Date.now())
  );
}

/** The name of the current directory, cut to the 40 characters of a project name. */
function defaultName(): string {
  const name = basename(process.cwd()).slice(0, 40);
  return name.length < 3 ? "meilisearch-trial" : name;
}

/** The team of an account with one team. With several, the CLI does not choose. */
function onlyTeam(teams: Map<number, string>): number {
  const [only, ...others] = teams.keys();
  if (only === undefined || others.length > 0) {
    throw new MeiliCliError("cli_usage", "Give --team-id: the account has several teams.", {
      hint: `The teams: ${[...teams].map(([id, name]) => `${id} (${name})`).join(", ")}. Run \`meili trial start --team-id <id>\`.`,
    });
  }
  return only;
}
