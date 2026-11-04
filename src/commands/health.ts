import { type Api, BaseCommand } from "../lib/base-command.js";

export default class Health extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /health"];

  static override description = "Check that the instance is available.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod",
    "<%= config.bin %> <%= command.id %> --project prod --output json",
    "<%= config.bin %> <%= command.id %> --project-url http://localhost:7700",
  ];

  static override flags = { ...BaseCommand.connectionFlags };

  async run(): Promise<void> {
    const health = await this.meilisearch.health();
    await this.output(health);
  }
}
