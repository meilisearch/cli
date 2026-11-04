import { Flags } from "@oclif/core";
import { type Api, BaseCommand, type WaitFlagValues } from "../../lib/base-command.js";
import {
  getApiV2ProjectsById,
  postApiV2Projects,
} from "../../lib/clients/management/generated/sdk.gen.js";
import type {
  PostApiV2ProjectsData,
  Project,
} from "../../lib/clients/management/generated/types.gen.js";
import { cloudOf, readTeamNames } from "../../lib/cloud-sync.js";
import { assertNoProject, type ConfigFile, maskSecret, writeConfigFile } from "../../lib/config.js";
import { MeiliCliError, writeNotice } from "../../lib/errors.js";
import { readBodyWithFields } from "../../lib/input.js";
import { formatDuration, pollUntil } from "../../lib/tasks.js";

/** The statuses `--wait` stops at: the project serves, or its creation failed. */
const FINAL_STATUSES: ReadonlySet<string> = new Set(["running", "failed"]);

export default class AddProjects extends BaseCommand {
  static api: Api = "management";

  static routes = ["POST /api/v2/projects"];

  static override description =
    "Create a Meilisearch Cloud project in a team, on a resource. The master key is printed masked: give --sync-config to write it to the config file instead.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3",
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3 --output json",
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3 --sync-config",
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3 --wait --sync-config",
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3 --ms-version v1.54.0",
    '<%= config.bin %> <%= command.id %> --data \'{"name":"demo","teamId":12,"resourceId":3}\'',
    "<%= config.bin %> <%= command.id %> --file project.json --name other-name",
  ];

  static override flags = {
    ...BaseCommand.managementFlags,
    name: Flags.string({ description: "Name of the project.", helpValue: "<name>" }),
    "team-id": Flags.integer({ description: "Team that owns the project.", helpValue: "<id>" }),
    "resource-id": Flags.integer({
      description: "Resource of the project: its plan and its region.",
      helpValue: "<id>",
    }),
    "ms-version": Flags.string({
      description: "Meilisearch version of the project, the latest by default.",
      helpValue: "<version>",
    }),
    "sync-config": Flags.boolean({
      description:
        "Add the project to the config file, as an entry named after it with its URL, its master key and its cloud identifiers.",
    }),
    wait: Flags.boolean({
      description: "Poll the project until its status is running or failed, then print it.",
    }),
    timeout: BaseCommand.waitFlags.timeout,
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AddProjects);
    const body = readBodyWithFields(flags, {
      name: flags.name,
      teamId: flags["team-id"],
      resourceId: flags["resource-id"],
      msVersion: flags["ms-version"],
    }) as NonNullable<PostApiV2ProjectsData["body"]>;

    // The entry takes the name checked here, whatever name the API answers.
    let sync: { file: ConfigFile; entry: string } | undefined;
    if (flags["sync-config"]) {
      if (typeof body.name !== "string" || body.name === "") {
        throw new MeiliCliError(
          "cli_usage",
          "`--sync-config` names the entry after the project: give `--name`.",
        );
      }
      const file = this.configFile();
      assertNoProject(file, body.name, ": nothing was created.");
      sync = { file, entry: body.name };
    }
    const created = await postApiV2Projects({ client: this.managementClient, body });
    const project = flags.wait ? await this.waitForProject(created.id, flags) : created;
    await this.output(
      project.masterKey === undefined
        ? project
        : { ...project, masterKey: maskSecret(project.masterKey) },
    );
    if (project.status === "failed") {
      throw new MeiliCliError(
        "cli_task_failed",
        `Project ${project.id} finished with status failed${sync === undefined ? "" : `, so it was not added to ${sync.file.path}`}.`,
      );
    }
    if (sync === undefined) return;
    if (project.url == null) {
      throw new MeiliCliError(
        "cli_config",
        `Project ${project.id} is created but has no URL yet, so it was not added to ${sync.file.path}.`,
        {
          hint: `Run \`meili config sync-with-cloud --project-name ${project.name}\` once \`meili get projects --id ${project.id}\` shows its URL: it adds the project with its master key.`,
        },
      );
    }
    writeConfigFile({
      path: sync.file.path,
      projects: {
        ...sync.file.projects,
        [sync.entry]: {
          url: project.url,
          apiKey: created.masterKey,
          cloud: cloudOf(project, await readTeamNames(this.managementClient)),
        },
      },
    });
  }

  /** The project once `running` or `failed`, as `GET /api/v2/projects/{id}` returns it: without its master key. */
  private async waitForProject(id: number, flags: WaitFlagValues): Promise<Project> {
    const timeoutMs = this.waitTimeoutMs(flags);
    return pollUntil(
      () => getApiV2ProjectsById({ client: this.managementClient, path: { id } }),
      (current) => FINAL_STATUSES.has(current.status),
      () =>
        new MeiliCliError(
          "cli_timeout",
          `Project ${id} did not reach status running or failed within ${formatDuration(timeoutMs)}. Its creation goes on on the server.`,
          { hint: `Run \`meili get projects --id ${id}\` to check its status.` },
        ),
      {
        timeoutMs,
        onProgress: (current) => {
          writeNotice(`waiting for project ${id}, status ${current.status}`);
        },
      },
    );
  }
}
