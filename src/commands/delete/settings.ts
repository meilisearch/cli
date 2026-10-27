import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";

export default class DeleteSettings extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["DELETE /indexes/{index_uid}/settings"];

  static keyActions = ["settings.update"];

  static override description =
    "Reset every setting of an index to its default value, which reindexes the documents.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies --yes",
    "<%= config.bin %> <%= command.id %> --index movies --yes --output json",
    "<%= config.bin %> <%= command.id %> --index movies --yes --wait",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      required: true,
      description:
        "The index to reset the settings of. `update settings --<setting> null` resets one of them.",
      helpValue: "<index>",
    }),
    ...BaseCommand.waitFlags,
    ...BaseCommand.confirmFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeleteSettings);
    await this.outputTask(await this.meilisearch.index(flags.index).resetSettings(), flags);
  }
}
