import { type Api, BaseCommand } from "../lib/base-command.js";

export default class Info extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /version"];

  static keyActions = ["version"];

  static override description = `Get the version of the instance.

Prints the version of Meilisearch and the commit it was built from.`;

  static override examples = ["<%= config.bin %> <%= command.id %> --project prod"];

  static override flags = { ...BaseCommand.connectionFlags };

  async run(): Promise<void> {
    await this.output(await this.meilisearch.getVersion());
  }
}
