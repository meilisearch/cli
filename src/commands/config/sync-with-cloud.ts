import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2Projects } from "../../lib/clients/management/generated/sdk.gen.js";
import { CONFIG_FILE_WARNING, writeConfigFile } from "../../lib/config.js";

export default class ConfigSyncWithCloud extends BaseCommand {
  static api: Api = "management";

  static override description =
    `Set the cloudId of the config file entries whose URL is a Meilisearch Cloud project the token sees. Never writes a key, never adds or removes an entry. Prints what changed.

${CONFIG_FILE_WARNING}`;

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
    const entries = file.projects;
    const report = { updated: [] as string[], unchanged: [] as string[], missing: [] as string[] };

    for (const project of projects) {
      const byId = Object.entries(entries).find(([, entry]) => entry.cloudId === project.id);
      if (byId !== undefined) {
        report.unchanged.push(byId[0]);
        continue;
      }
      const url = project.url;
      if (url == null) continue;
      const byUrl = Object.entries(entries).find(
        ([, entry]) => entry.cloudId === undefined && sameOrigin(entry.url, url),
      );
      if (byUrl === undefined) continue;
      const [name, entry] = byUrl;
      entries[name] = { ...entry, cloudId: project.id };
      report.updated.push(name);
    }

    if (flags["team-id"] === undefined) {
      const ids = new Set(projects.map((project) => project.id));
      for (const [name, entry] of Object.entries(entries)) {
        if (entry.cloudId !== undefined && !ids.has(entry.cloudId)) report.missing.push(name);
      }
    }
    if (report.updated.length > 0) writeConfigFile(file);
    await this.output(report);
  }
}

/** The same instance: scheme and host, whatever the path or the case. */
function sameOrigin(a: string, b: string): boolean {
  const left = URL.parse(a)?.origin;
  return left !== undefined && left === URL.parse(b)?.origin;
}
