import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { itemView } from "../../lib/human.js";
import { paint } from "../../lib/output.js";

export default class SettingsView extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /indexes/{index_uid}/settings"];

  static keyActions = ["settings.get"];

  static override description = `Get the settings of an index.

Each setting has its current value or its default.`;

  static override examples = ["<%= config.bin %> <%= command.id %> --project prod --index movies"];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      char: "i",
      required: true,
      description: "The index to read the settings of.",
      helpValue: "<index>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SettingsView);
    await this.output(await this.meilisearch.index(flags.index).getSettings(), (settings) =>
      itemView([paint("bold", `Settings of index ${flags.index}`)], settings),
    );
  }
}
