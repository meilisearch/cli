import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { postApiV2Projects } from "../../lib/clients/management/generated/sdk.gen.js";
import type { PostApiV2ProjectsData } from "../../lib/clients/management/generated/types.gen.js";
import { cloudOf, readTeamNames, waitForProject } from "../../lib/cloud-sync.js";
import { assertNoProject, type ConfigFile, maskSecret, writeConfigFile } from "../../lib/config.js";
import { MeiliCliError } from "../../lib/errors.js";
import { projectBrief, projectBriefNext } from "../../lib/human.js";
import { readBodyWithFields } from "../../lib/input.js";
import { paint } from "../../lib/output.js";

export default class ProjectAdd extends BaseCommand {
  static api: Api = "management";

  static routes = ["POST /api/v2/projects"];

  static override description = `Create a Meilisearch Cloud project.

Creates it in a team, on a resource. The master key is printed masked: give --sync-config to write it to the config file instead.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3",
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3 --sync-config",
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3 --wait --sync-config",
    "<%= config.bin %> <%= command.id %> --name demo --team-id 12 --resource-id 3 --ms-version v1.54.0",
    '<%= config.bin %> <%= command.id %> --data \'{"name":"demo","teamId":12,"resourceId":3}\'',
    "<%= config.bin %> <%= command.id %> --file project.json --name other-name",
  ];

  static override flags = {
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
    const { flags } = await this.parse(ProjectAdd);
    // An invalid --timeout fails here, before a project exists.
    const timeoutMs = flags.wait ? this.waitTimeoutMs(flags) : undefined;
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
    const progress = this.waitProgress(`Project ${created.id}`);
    const project =
      timeoutMs === undefined
        ? created
        : await waitForProject(this.managementClient, created.id, {
            timeoutMs,
            onProgress: (current) => progress.update(current.status),
          });
    progress.end();
    const running = project.status === "running";
    await this.output(
      project.masterKey === undefined
        ? project
        : { ...project, masterKey: maskSecret(project.masterKey) },
      (shown) => ({
        status:
          project.status === "failed"
            ? []
            : [
                running
                  ? `${paint("green", "✓")} Project ${project.name} is running.`
                  : `${paint("yellow", "◐")} Project ${project.name} is created and is starting. This takes a few minutes.`,
              ],
        data: projectBrief(shown),
        next: [
          projectBriefNext(project.id),
          ...(sync !== undefined || project.status === "failed"
            ? []
            : [
                ...(running
                  ? []
                  : [
                      `${paint("dim", "Check when it is ready:")} meili project view --id ${project.id}`,
                    ]),
                paint(
                  "dim",
                  `${running ? "Save" : "Once it is Running, save"} its URL and master key in the config file:`,
                ),
                // The URL names this project alone; two teams may have a project of this name.
                `  meili config sync-with-cloud ${project.url == null ? `--project-name ${project.name}` : `--project-url ${project.url}`}`,
              ]),
        ],
      }),
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
          hint: `Run \`meili config sync-with-cloud --project-name ${project.name}\` once \`meili project view --id ${project.id}\` shows its URL: it adds the project with its master key.`,
        },
      );
    }
    const cloud = cloudOf(project, await readTeamNames(this.managementClient));
    // Read again: with --wait, minutes may have passed since the check above.
    const file = this.configFile();
    assertNoProject(
      file,
      sync.entry,
      `: project ${project.id} is created but was not added to it.`,
    );
    writeConfigFile({
      path: file.path,
      projects: {
        ...file.projects,
        [sync.entry]: { url: project.url, apiKey: created.masterKey, cloud },
      },
    });
    // A blank line after the project, which is printed above.
    this.say(
      "",
      `${paint("green", "✓")} Added to the config file as ${sync.entry}. Use it with -p ${sync.entry}.`,
    );
  }
}
