import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { itemView, summaryLine } from "../../lib/human.js";
import { paint } from "../../lib/output.js";

export default class IndexView extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /indexes/{index_uid}"];

  static keyActions = ["indexes.get"];

  static override description = "Get one index.";

  static override examples = ["<%= config.bin %> <%= command.id %> --project prod --id movies"];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({ required: true, description: "The index to get.", helpValue: "<index>" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(IndexView);
    await this.output(await this.meilisearch.getRawIndex(flags.id), (index) =>
      itemView(
        [
          paint("bold", `Index ${index.uid}`),
          summaryLine(
            `Primary key ${index.primaryKey ?? paint("dim", "not set")}`,
            `Updated ${index.updatedAt}`,
          ),
        ],
        index,
      ),
    );
  }
}
