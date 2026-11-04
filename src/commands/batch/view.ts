import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";

export default class BatchView extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /batches/{batch_id}"];

  static keyActions = ["tasks.get"];

  static override description = "Get one batch of tasks.";

  static override examples = ["<%= config.bin %> <%= command.id %> --project prod --id 7"];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.integer({ required: true, description: "The batch uid.", helpValue: "<uid>" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BatchView);
    await this.output(await this.meilisearch.batches.getBatch(flags.id));
  }
}
