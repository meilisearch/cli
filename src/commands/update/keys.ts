import { Flags } from "@oclif/core";
import type { KeyUpdate } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { readJsonObjectBody } from "../../lib/input.js";
import { asText } from "../../lib/values.js";

export default class UpdateKeys extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["PATCH /keys/{key}"];

  static keyActions = ["keys.update"];

  static override description =
    "Change the name or the description of an API key, the two fields the route takes, and reset one with the value null.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --id 52787ccd-48ff-48e5-9c4b-03cd76978a60 --name 'CI indexer'",
    "<%= config.bin %> <%= command.id %> --id 52787ccd-48ff-48e5-9c4b-03cd76978a60 --description 'Indexes the catalog nightly' --output json",
    "<%= config.bin %> <%= command.id %> --id 52787ccd-48ff-48e5-9c4b-03cd76978a60 --description null",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({
      required: true,
      description: "The key to update, by its uid or by its key value.",
      helpValue: "<key>",
    }),
    name: Flags.string({
      description: "New name of the key. The value null removes the one it has.",
      helpValue: "<name>",
    }),
    description: Flags.string({
      description: "New description of the key. The value null removes the one it has.",
      helpValue: "<text>",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(UpdateKeys);
    const fromFlags: Record<string, unknown> = {
      name: asText(flags.name),
      description: asText(flags.description),
    };
    const update = {
      ...readJsonObjectBody(flags),
      ...Object.fromEntries(Object.entries(fromFlags).filter(([, value]) => value !== undefined)),
    } as KeyUpdate;
    await this.output(await this.meilisearch.updateKey(flags.id, update));
  }
}
