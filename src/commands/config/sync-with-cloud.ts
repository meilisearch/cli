import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2Projects } from "../../lib/clients/management/generated/sdk.gen.js";
import { type ProjectEntry, writeConfigFile } from "../../lib/config.js";
import { MeiliCliError } from "../../lib/errors.js";

export default class ConfigSyncWithCloud extends BaseCommand {
  static api: Api = "management";

  static override description =
    `Add the Meilisearch Cloud projects the token sees to the config file, and set the cloudId of the entries that already have their URL. Never writes a key, never removes an entry. Prints what changed.

The file holds API keys and decides where every later command goes, for every process that reads it: an agent runs this only when the human asked for it explicitly.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --team-id 12",
    "<%= config.bin %> <%= command.id %> --output json",
  ];

  static override flags = {
    "team-id": Flags.integer({
      description: "Only the projects of this team; missing entries are then not reported.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSyncWithCloud);
    const projects = await getApiV2Projects({
      client: this.managementClient,
      query: { teamId: flags["team-id"] },
    });
    const file = this.configFile();
    const entries: Record<string, ProjectEntry> = { ...file.projects };
    const report = {
      added: [] as string[],
      updated: [] as string[],
      unchanged: [] as string[],
      missing: [] as string[],
    };
    const seen = new Set<number>();

    for (const project of projects) {
      seen.add(project.id);
      const byId = Object.keys(entries).find((name) => entries[name]?.cloudId === project.id);
      if (byId !== undefined) {
        report.unchanged.push(byId);
        continue;
      }
      if (project.url === undefined || project.url === null) {
        throw new MeiliCliError(
          "cli_config",
          `Project \`${project.name}\` (${project.id}) has no URL yet: run this again once it has one.`,
        );
      }
      const url = project.url;
      const byUrl = Object.keys(entries).find((name) => {
        const entry = entries[name];
        return entry?.cloudId === undefined && sameOrigin(entry?.url ?? "", url);
      });
      if (byUrl !== undefined) {
        entries[byUrl] = {
          ...entries[byUrl],
          url: entries[byUrl]?.url ?? url,
          cloudId: project.id,
        };
        report.updated.push(byUrl);
        continue;
      }
      if (entries[project.name] !== undefined) {
        throw new MeiliCliError(
          "cli_config",
          `Project \`${project.name}\` already exists in ${file.path} with another URL: nothing was written.`,
          {
            hint: `Run \`meili config update --project ${project.name} --project-cloud-id ${project.id}\` if it is the same project, or rename the entry.`,
          },
        );
      }
      entries[project.name] = { url, cloudId: project.id };
      report.added.push(project.name);
    }

    if (flags["team-id"] === undefined) {
      for (const [name, entry] of Object.entries(file.projects)) {
        if (entry.cloudId !== undefined && !seen.has(entry.cloudId)) report.missing.push(name);
      }
    }
    if (report.added.length > 0 || report.updated.length > 0) {
      writeConfigFile({ path: file.path, projects: entries });
    }
    await this.output(report);
  }
}

/** The same instance: scheme and host, whatever the path or the case. */
function sameOrigin(a: string, b: string): boolean {
  const left = URL.parse(a)?.origin;
  return left !== undefined && left === URL.parse(b)?.origin;
}
