import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../lib/base-command.js";
import { fetchStats } from "../lib/clients/meilisearch.js";
import { itemView, summaryLine } from "../lib/human.js";
import { paint } from "../lib/output.js";

export default class Stats extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /stats", "GET /indexes/{index_uid}/stats"];

  static keyActions = ["stats.get"];

  static override description = `Get the statistics of the instance, or of one index.

--index names the index.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod",
    "<%= config.bin %> <%= command.id %> -p prod --index movies",
    "<%= config.bin %> <%= command.id %> -p prod -i movies --size-format human --show-internal-database-sizes",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      char: "i",
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
    const { flags } = await this.parse(Stats);
    await this.output(
      await fetchStats(this.meilisearch, flags.index, {
        showInternalDatabaseSizes: flags["show-internal-database-sizes"] ? true : undefined,
        sizeFormat: flags["size-format"],
      }),
      (stats) => {
        // The fields the summary reads, in both routes' responses.
        const { indexes, databaseSize, lastUpdate, numberOfDocuments, isIndexing } =
          stats as Record<string, unknown>;
        const count = Object.keys(indexes ?? {}).length;
        const summary =
          flags.index === undefined
            ? [
                paint("bold", "Statistics of the instance"),
                summaryLine(
                  `${count} ${count === 1 ? "index" : "indexes"}`,
                  `Database size ${databaseSize}`,
                  `Last update ${lastUpdate ?? paint("dim", "never")}`,
                ),
              ]
            : [
                paint("bold", `Statistics of index ${flags.index}`),
                summaryLine(
                  `${numberOfDocuments} documents`,
                  isIndexing === true ? "Indexing" : "Not indexing",
                ),
              ];
        return itemView(summary, stats as object);
      },
    );
  }
}
