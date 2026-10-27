import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";

export default class GetSettings extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /indexes/{index_uid}/settings"];

  static keyActions = ["settings.get"];

  static override description =
    "Get every setting of an index, each with its current value or its default.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies",
    "<%= config.bin %> <%= command.id %> --index movies --output json",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      required: true,
      description: "The index to read the settings of.",
      helpValue: "<index>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetSettings);
    await this.output(await this.meilisearch.index(flags.index).getSettings());
  }
}
