import { Flags } from "@oclif/core";
import type { KeyCreation } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { readJsonObjectBody } from "../../lib/input.js";
import { asList, asText } from "../../lib/values.js";

export default class AddKeys extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /keys"];

  static keyActions = ["keys.create"];

  static override description =
    `Create an API key that runs --actions on --indexes until --expires-at.

The answer carries the \`key\` field, the credential itself, on stdout like any other data.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --actions search --indexes movies --expires-at null",
    "<%= config.bin %> <%= command.id %> --actions search --indexes '*' --expires-at 2027-01-01T00:00:00Z --output json",
    "<%= config.bin %> <%= command.id %> --actions documents.add,documents.delete --indexes movies --expires-at null --name 'CI indexer'",
    '<%= config.bin %> <%= command.id %> --data \'{"actions":["search"],"indexes":["movies"],"expiresAt":null}\'',
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
      description: "Name of the key, for a human reading the list.",
      helpValue: "<name>",
    }),
    description: Flags.string({
      description: "Description of the key, for a human reading the list.",
      helpValue: "<text>",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AddKeys);
    const fromFlags: Record<string, unknown> = {
      uid: flags.id,
      actions: asList(flags.actions),
      indexes: asList(flags.indexes),
      expiresAt: asText(flags["expires-at"]),
      name: asText(flags.name),
      description: asText(flags.description),
    };
    // The body of --file or --data first, then the flags, which override a field of it (rule 8).
    // The API refuses a body missing actions, indexes or expiresAt, with its own code: the CLI
    // judges no value it can send.
    const key = {
      ...readJsonObjectBody(flags),
      ...Object.fromEntries(Object.entries(fromFlags).filter(([, value]) => value !== undefined)),
    } as KeyCreation;
    await this.output(await this.meilisearch.createKey(key));
  }
}
