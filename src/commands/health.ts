import { type Api, BaseCommand } from "../lib/base-command.js";

export default class Health extends BaseCommand {
  static api: Api = "engine";

  static override description = "Check that the Meilisearch instance is available.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "MEILI_URL=http://localhost:7700 <%= config.bin %> <%= command.id %>",
  ];

  async run(): Promise<void> {
    const health = await this.engine.health();
    await this.output(health);
  }
}
