import { type Api, BaseCommand } from "../lib/base-command.js";

export default class Version extends BaseCommand {
  static api: Api = "none";

  static override description = "Print the version of the CLI.";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    await this.parse(Version);
    await this.output({ version: this.config.version });
  }
}
