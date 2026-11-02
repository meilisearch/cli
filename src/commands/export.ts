import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../lib/base-command.js";
import { triggerExport } from "../lib/clients/meilisearch.js";
import { readBodyWithFields } from "../lib/input.js";
import { asJson, asText } from "../lib/values.js";

export default class Export extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /export"];

  static keyActions = ["export"];

  static override description =
    `Send the documents and the settings of this instance to the Meilisearch at --url, and answer the task that does it.

The export writes on that instance with the credentials of --api-key, and --indexes narrows it to the indexes those patterns match.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --url https://ms-1234.heaven.meilisearch.com --api-key <key>",
    "<%= config.bin %> <%= command.id %> --url https://ms-1234.heaven.meilisearch.com --api-key <key> --output json",
    `<%= config.bin %> <%= command.id %> --url http://localhost:7701 --indexes '{"movies":{"filter":"rating > 4"}}' --wait`,
    "<%= config.bin %> <%= command.id %> --url http://localhost:7701 --payload-size 24MiB",
    `<%= config.bin %> <%= command.id %> --data '{"url":"http://localhost:7701","indexes":{"*":{"overrideSettings":true}}}'`,
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    url: Flags.string({
      description: "URL of the Meilisearch instance the data is sent to.",
      helpValue: "<url>",
    }),
    "api-key": Flags.string({
      description:
        "API key of that instance, the one the export writes with. --project-api-key stays the key of this one.",
      helpValue: "<key>",
    }),
    "payload-size": Flags.string({
      description: "Maximum size of one request sent to that instance, for example 24MiB.",
      helpValue: "<size>",
    }),
    indexes: Flags.string({
      description:
        'The indexes to export and how, as JSON: an index pattern per key, its filter and overrideSettings as value. Every index by default, `{"*":{}}`.',
      helpValue: "<json>",
    }),
    ...BaseCommand.bodyInputFlags,
    ...BaseCommand.waitFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Export);
    const body = readBodyWithFields(flags, {
      url: asText(flags.url),
      apiKey: asText(flags["api-key"]),
      payloadSize: asText(flags["payload-size"]),
      indexes: asJson(flags.indexes),
    });
    await this.outputTask(await triggerExport(this.meilisearch, body), flags);
  }
}
