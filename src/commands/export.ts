import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../lib/base-command.js";
import { triggerExport } from "../lib/clients/meilisearch.js";
import { projectOf } from "../lib/config.js";
import { readBodyWithFields } from "../lib/input.js";
import { asJson, asText } from "../lib/values.js";

/** The flags that describe the instance the data is sent to, apart in `--help`. */
const DESTINATION = "DESTINATION";

export default class Export extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /export"];

  static keyActions = ["export"];

  static override description =
    `Send the documents and the settings of the source instance to the destination instance, and answer the task that does it.

The source is the project this command connects to, named by --project, --project-url and --project-api-key as on every command: it receives the request and does the export. The destination is --url with --api-key, or --project-destination, an entry of the config file. --indexes narrows the export to the indexes those patterns match.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --url https://ms-1234.heaven.meilisearch.com --api-key <key>",
    "<%= config.bin %> <%= command.id %> --project prod --url https://ms-1234.heaven.meilisearch.com --api-key <key> --output json",
    "<%= config.bin %> <%= command.id %> --project staging --project-destination prod",
    `<%= config.bin %> <%= command.id %> --project prod --url http://localhost:7701 --indexes '{"movies":{"filter":"rating > 4"}}' --wait`,
    "<%= config.bin %> <%= command.id %> --project prod --url http://localhost:7701 --payload-size 24MiB",
    `<%= config.bin %> <%= command.id %> --project prod --data '{"url":"http://localhost:7701","indexes":{"*":{"overrideSettings":true}}}'`,
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    url: Flags.string({
      description: "URL of the destination instance, the one the data is sent to.",
      helpValue: "<url>",
      helpGroup: DESTINATION,
    }),
    "api-key": Flags.string({
      description:
        "API key of the destination instance, the one the export writes with. --project-api-key stays the key of the source.",
      helpValue: "<key>",
      helpGroup: DESTINATION,
    }),
    "project-destination": Flags.string({
      description:
        "A project of the config file, the destination: its URL and its key stand for --url and --api-key. Cannot be combined with --url. --api-key replaces its key.",
      helpValue: "<name>",
      helpGroup: DESTINATION,
      exclusive: ["url"],
    }),
    "payload-size": Flags.string({
      description: "Maximum size of one request sent to the destination, for example 24MiB.",
      helpValue: "<size>",
      helpGroup: DESTINATION,
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
    const name = flags["project-destination"];
    const destination = name === undefined ? undefined : projectOf(this.configFile(), name);
    const body = readBodyWithFields(flags, {
      url: asText(flags.url ?? destination?.url),
      apiKey: asText(flags["api-key"] ?? destination?.apiKey),
      payloadSize: asText(flags["payload-size"]),
      indexes: asJson(flags.indexes),
    });
    await this.outputTask(await triggerExport(this.meilisearch, body), flags);
  }
}
