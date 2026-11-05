import { Flags } from "@oclif/core";
import type { KeyCreation } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { readBodyWithFields } from "../../lib/input.js";
import { asList, asText } from "../../lib/values.js";

export default class KeyAdd extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /keys"];

  static keyActions = ["keys.create"];

  static override description = `Create an API key.

The key runs --actions on --indexes until --expires-at.

The answer carries the \`key\` field, the credential itself, on stdout like any other data.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --actions search --indexes movies --expires-at null",
    "<%= config.bin %> <%= command.id %> -p prod --actions search --indexes '*' --expires-at 2027-01-01T00:00:00Z",
    "<%= config.bin %> <%= command.id %> -p prod --actions documents.add,documents.delete --indexes movies --expires-at null --name 'CI indexer'",
    '<%= config.bin %> <%= command.id %> -p prod --data \'{"actions":["search"],"indexes":["movies"],"expiresAt":null}\'',
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    id: Flags.string({
      aliases: ["uid"],
      description: "Uid of the key, a uuid v4. Without it, Meilisearch generates one.",
      helpValue: "<uuid>",
    }),
    actions: Flags.string({
      description:
        "Actions the key permits, comma-separated, for example `search` or `documents.*`. `*` permits them all.",
      helpValue: "<actions>",
    }),
    indexes: Flags.string({
      description:
        "Indexes the key reaches, comma-separated. `*` reaches them all, and `products_*` every index of that prefix.",
      helpValue: "<indexes>",
    }),
    "expires-at": Flags.string({
      description:
        "Expiration date in RFC 3339 format. The value null creates a key that never expires.",
      helpValue: "<date>",
    }),
    name: Flags.string({
      description: "Name of the key.",
      helpValue: "<name>",
    }),
    description: Flags.string({
      description: "Description of the key.",
      helpValue: "<text>",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(KeyAdd);
    const fromFlags: Record<string, unknown> = {
      uid: flags.id,
      actions: asList(flags.actions),
      indexes: asList(flags.indexes),
      expiresAt: asText(flags["expires-at"]),
      name: asText(flags.name),
      description: asText(flags.description),
    };
    // The API refuses a body missing actions, indexes or expiresAt, with its own
    // code: the CLI judges no value it can send.
    const key = readBodyWithFields(flags, fromFlags) as KeyCreation;
    await this.output(await this.meilisearch.createKey(key));
  }
}
