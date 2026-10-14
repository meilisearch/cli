import { type Api, BaseCommand } from "../../lib/base-command.js";
import { redactBody } from "../../lib/config.js";

export default class ConfigList extends BaseCommand {
  static api: Api = "none";

  static override description = "Print the config file path and its projects as JSON, keys masked.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "MEILI_CONFIG=./meili.json <%= config.bin %> <%= command.id %>",
  ];

  async run(): Promise<void> {
    const file = this.configFile();
    // Entry by entry: a project named `key` is not a secret.
    const projects = Object.fromEntries(
      Object.entries(file.projects).map(([name, entry]) => [name, redactBody(entry)]),
    );
    await this.output({ path: file.path, projects });
  }
}
