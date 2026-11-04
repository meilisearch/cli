import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";

export default class KeyView extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /keys/{key}"];

  static keyActions = ["keys.get"];

  static override description = `Get one API key.

The answer is the API body as it is, so it carries the \`key\` field: a credential that works, on stdout, like any other data.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --id 52787ccd-48ff-48e5-9c4b-03cd76978a60",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({
      required: true,
      description: "The key to get, by its uid or by its key value.",
      helpValue: "<key>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(KeyView);
    await this.output(await this.meilisearch.getKey(flags.id));
  }
}
