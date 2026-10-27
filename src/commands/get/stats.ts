import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { fetchStats } from "../../lib/clients/meilisearch.js";

export default class GetStats extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /stats", "GET /indexes/{index_uid}/stats"];

  static keyActions = ["stats.get"];

  static override description =
    "Get the statistics of the whole instance, or those of one index with --index.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --index movies",
    "<%= config.bin %> <%= command.id %> --index movies --size-format human --show-internal-database-sizes",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      description: "The index to read the statistics of. Without it, the whole instance.",
      helpValue: "<index>",
    }),
    "show-internal-database-sizes": Flags.boolean({
      description: "Add internalDatabaseSizes to the response, the size of each internal database.",
    }),
    "size-format": Flags.option({
      options: ["raw", "human"] as const,
      description:
        "How the sizes are written: raw (default), a number of bytes, or human, a string with its unit.",
    })(),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetStats);
    await this.output(
      await fetchStats(this.meilisearch, flags.index, {
        showInternalDatabaseSizes: flags["show-internal-database-sizes"] ? true : undefined,
        sizeFormat: flags["size-format"],
      }),
    );
  }
}
