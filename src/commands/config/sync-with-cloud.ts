import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import type { Project } from "../../lib/clients/management/generated/types.gen.js";
import {
  cloudOf,
  findProjectByUrl,
  listCloudProjects,
  type ReachableProject,
  readMasterKey,
  readTeamNames,
  sameOrigin,
  warnUrlAnomaly,
} from "../../lib/cloud-sync.js";
import {
  assertProjectUrl,
  CONFIG_FILE_WARNING,
  type ConfigFile,
  entriesOfCloudId,
  type ProjectEntry,
  writeConfigFile,
} from "../../lib/config.js";
import { MeiliCliError, writeWarning } from "../../lib/errors.js";

const SCOPES = ["all", "team-ids", "project-name", "project-url"];

export default class ConfigSyncWithCloud extends BaseCommand {
  static api: Api = "management";

  static override description =
    `Give every Meilisearch Cloud project of the scope an entry of the config file, with its cloud identifiers, and its master key when the entry has no key. Never replaces a key, never removes an entry. Prints one item per project.

${CONFIG_FILE_WARNING}`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --all",
    "<%= config.bin %> <%= command.id %> --team-ids 12,13",
    "<%= config.bin %> <%= command.id %> --project-name prod",
    "<%= config.bin %> <%= command.id %> --project-url https://ms-abc.sfo.meilisearch.io --output json",
  ];

  static override flags = {
    all: Flags.boolean({ description: "Every project the token sees.", exactlyOne: SCOPES }),
    "team-ids": Flags.string({
      description: "The projects of these teams, comma-separated.",
      helpValue: "<ids>",
      exactlyOne: SCOPES,
    }),
    "project-name": Flags.string({
      description: "The projects with exactly this name, in any team.",
      helpValue: "<name>",
      exactlyOne: SCOPES,
    }),
    "project-url": Flags.string({
      description: "The project with this URL, same scheme and host.",
      helpValue: "<url>",
      exactlyOne: SCOPES,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSyncWithCloud);
    const url = flags["project-url"];
    if (url !== undefined) assertProjectUrl(url);
    const teamIds = flags["team-ids"]?.split(",").map((id) => {
      if (!/^\d+$/.test(id)) {
        throw new MeiliCliError("cli_usage", `Invalid team id \`${id}\` in \`--team-ids\`.`);
      }
      return Number(id);
    });
    const file = this.configFile();

    let projects: Project[];
    if (teamIds !== undefined) {
      const lists = await Promise.all(
        [...new Set(teamIds)].map((id) => listCloudProjects(this.managementClient, id)),
      );
      projects = lists.flat();
    } else if (url !== undefined) {
      projects = [await findProjectByUrl(this.managementClient, url)];
    } else {
      const name = flags["project-name"];
      projects = (await listCloudProjects(this.managementClient)).filter(
        (project) => name === undefined || project.name === name,
      );
      if (name !== undefined && projects.length === 0) {
        throw new MeiliCliError(
          "cli_config",
          `No Meilisearch Cloud project is named \`${name}\`: nothing was written.`,
        );
      }
    }
    const teams = await readTeamNames(this.managementClient);

    const reachable = projects.filter((project): project is ReachableProject => {
      if (project.url != null) return true;
      writeWarning(
        new MeiliCliError(
          "cli_config",
          `Project ${project.id} (${project.name}) has no URL yet, it is still being created: it was skipped.`,
        ),
      );
      return false;
    });
    // The entry of each project: the one the file has, or a new one named after it.
    const matched = reachable.map((project) => ({ project, entry: entryOfProject(file, project) }));
    const newNames = matched.filter(({ entry }) => entry === undefined).map((m) => m.project.name);
    const planned = matched.map(({ project, entry }) => ({
      project,
      name: entry ?? newEntryName(file, project, newNames),
    }));

    const entries: Record<string, ProjectEntry> = { ...file.projects };
    const report = [];
    for (const { project, name } of planned) {
      const before = file.projects[name];
      if (before !== undefined) warnUrlAnomaly(name, before.url, project);
      const kept = before?.apiKey !== undefined;
      const apiKey = before?.apiKey ?? (await readMasterKey(this.managementClient, project, name));
      const entry: ProjectEntry = {
        url: before?.url ?? project.url,
        ...(apiKey === undefined ? {} : { apiKey }),
        cloud: cloudOf(project, teams),
      };
      entries[name] = entry;
      report.push({
        project: name,
        cloud: entry.cloud,
        action:
          before === undefined
            ? "added"
            : JSON.stringify(entry) === JSON.stringify(before)
              ? "unchanged"
              : "updated",
        apiKey: kept ? "kept" : apiKey !== undefined ? "written" : "missing",
      });
    }
    if (report.some((each) => each.action !== "unchanged")) {
      writeConfigFile({ path: file.path, projects: entries });
    }
    await this.output(report, { supportsNdjson: true });
  }
}

/**
 * The entry the file already has for `project`: the one whose `cloud.id` is
 * its id, else the one without `cloud` on its URL. Several is `cli_config`:
 * the CLI does not pick one.
 */
function entryOfProject(file: ConfigFile, project: ReachableProject): string | undefined {
  let names = entriesOfCloudId(file, project.id);
  if (names.length === 0) {
    names = Object.keys(file.projects).filter((name) => {
      const entry = file.projects[name];
      return entry?.cloud === undefined && sameOrigin(entry?.url ?? "", project.url);
    });
  }
  if (names.length > 1) {
    throw new MeiliCliError(
      "cli_config",
      `Projects ${names.map((name) => `\`${name}\``).join(", ")} of ${file.path} are all Cloud project ${project.id}: nothing was written.`,
      { hint: "Keep one of them with `meili config unset --project <name>`." },
    );
  }
  return names[0];
}

/**
 * A new entry is named after its project, `<name>-<id>` when another new
 * entry of the run or an entry of the file has that name.
 */
function newEntryName(file: ConfigFile, { name, id }: Project, newNames: string[]): string {
  if (
    newNames.filter((other) => other === name).length === 1 &&
    !Object.hasOwn(file.projects, name)
  ) {
    return name;
  }
  const suffixed = `${name}-${id}`;
  if (Object.hasOwn(file.projects, suffixed)) {
    throw new MeiliCliError(
      "cli_config",
      `Project ${id} would be the entry \`${suffixed}\`, which ${file.path} already has: nothing was written.`,
      {
        hint: `Rename that entry: \`meili config unset --project ${suffixed}\`, then \`meili config set\`.`,
      },
    );
  }
  writeWarning(
    new MeiliCliError(
      "cli_config",
      `The name \`${name}\` is taken: project ${id} is the entry \`${suffixed}\`.`,
    ),
  );
  return suffixed;
}
