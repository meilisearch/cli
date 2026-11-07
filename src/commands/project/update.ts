import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { patchApiV2ProjectsById } from "../../lib/clients/management/generated/sdk.gen.js";
import type { PatchApiV2ProjectsByIdData } from "../../lib/clients/management/generated/types.gen.js";
import { cloudOf, readTeamNames } from "../../lib/cloud-sync.js";
import {
  assertNoProject,
  type ConfigFile,
  cloudProjectEntry,
  writeConfigFile,
} from "../../lib/config.js";
import { MeiliCliError } from "../../lib/errors.js";
import { projectView } from "../../lib/human.js";
import { readBodyWithFields } from "../../lib/input.js";
import { paint } from "../../lib/output.js";

export default class ProjectUpdate extends BaseCommand {
  static api: Api = "management";

  static routes = ["PATCH /api/v2/projects/{id}"];

  static override description = "Rename a Meilisearch Cloud project.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 343 --name renamed",
    "<%= config.bin %> <%= command.id %> --project prod --name renamed",
    "<%= config.bin %> <%= command.id %> -p prod --name renamed --sync-config",
    '<%= config.bin %> <%= command.id %> --id 343 --data \'{"name":"renamed"}\'',
  ];

  static override flags = {
    ...BaseCommand.cloudProjectFlags,
    id: Flags.integer({
      description:
        "The project to update, or give --project <name> and its cloud.id from the config file.",
      helpValue: "<id>",
    }),
    name: Flags.string({ description: "New name of the project.", helpValue: "<name>" }),
    "sync-config": Flags.boolean({
      description:
        "Rename the project's entry of the config file after it: the entry --project names, or the one whose cloud.id is --id. Refreshes its cloud identifiers.",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ProjectUpdate);
    const id = this.cloudProjectId(flags.id);
    const body = readBodyWithFields(flags, { name: flags.name }) as NonNullable<
      PatchApiV2ProjectsByIdData["body"]
    >;

    // The entry takes the name checked here, whatever name the API answers.
    let sync: { file: ConfigFile; entry: string; name: string } | undefined;
    if (flags["sync-config"]) {
      if (typeof body.name !== "string" || body.name === "") {
        throw new MeiliCliError(
          "cli_usage",
          "`--sync-config` renames the entry after the project: give `--name`.",
        );
      }
      const file = this.configFile();
      const entry = cloudProjectEntry(file, flags.project, id, ": nothing was renamed.");
      if (body.name !== entry) assertNoProject(file, body.name, ": nothing was renamed.");
      sync = { file, entry, name: body.name };
    }
    const project = await patchApiV2ProjectsById({
      client: this.managementClient,
      path: { id },
      body,
    });
    await this.output(project, () => ({
      status: [`${paint("green", "✓")} Project ${project.id} is renamed to ${project.name}.`],
      data: projectView(project),
    }));
    if (sync === undefined) return;
    const cloud = cloudOf(project, await readTeamNames(this.managementClient));
    writeConfigFile({
      path: sync.file.path,
      projects: Object.fromEntries(
        Object.entries(sync.file.projects).map(([name, entry]) =>
          name === sync.entry ? [sync.name, { ...entry, cloud }] : [name, entry],
        ),
      ),
    });
    // A blank line after the project, which is printed above.
    this.say("", `${paint("green", "✓")} Config entry ${sync.entry} is renamed to ${sync.name}.`);
  }
}
