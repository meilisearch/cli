import { type Api, BaseCommand } from "../lib/base-command.js";

export default class Version extends BaseCommand {
  static api: Api = "none";

  static override description = "Print the CLI version & platform information.";

  static override examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    await this.parse(Version);
    await this.output({
      version: this.config.version,
      platform: `${this.config.platform}-${this.config.arch}`,
      node: process.version,
    });
  }
}
