import { Flags } from "@oclif/core";
import type { HybridSearch, SearchForFacetValuesParams } from "meilisearch";
import { type Api, BaseCommand } from "../lib/base-command.js";
import { readBodyWithFields } from "../lib/input.js";
import { asJson, asNumber } from "../lib/values.js";

export default class FacetSearch extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /indexes/{index_uid}/facet-search"];

  static keyActions = ["search"];

  static override description =
    "Search the values of one facet attribute of an index, counted on the documents --q and --filter keep.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies --facet-name genres --facet-query ac",
    "<%= config.bin %> <%= command.id %> --index movies --facet-name genres --facet-query ac --output json",
    "<%= config.bin %> <%= command.id %> --index movies --facet-name genres --q horror --filter 'rating > 4'",
    '<%= config.bin %> <%= command.id %> --index movies --data \'{"facetName":"genres","facetQuery":"ac"}\'',
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      required: true,
      description: "The index to search the facet values in.",
      helpValue: "<index>",
    }),
    "facet-name": Flags.string({
      description:
        "The facet attribute to search in. It must be one of the filterable attributes of the index.",
      helpValue: "<attribute>",
    }),
    "facet-query": Flags.string({
      description:
        "The terms the facet values are matched against, the first word only. Omit it to return every value, up to 100.",
      helpValue: "<query>",
    }),
    q: Flags.string({
      description:
        "The search terms that narrow the documents the facet values are computed on, not the values themselves.",
      helpValue: "<query>",
    }),
    filter: Flags.string({
      description:
        "Filter expression, for example `rating > 4`. Its array-of-arrays form goes through --data.",
      helpValue: "<filter>",
    }),
    "matching-strategy": Flags.option({
      options: ["last", "all", "frequency"] as const,
      description: "How the terms of --q are relaxed when there are not enough results.",
    })(),
    "attributes-to-search-on": Flags.string({
      description: "Restrict the search of --q to these searchable attributes, comma-separated.",
      helpValue: "<fields>",
    }),
    "ranking-score-threshold": Flags.string({
      description:
        "Count only the documents whose ranking score reaches this value, between 0.0 and 1.0.",
      helpValue: "<number>",
    }),
    locales: Flags.string({
      description: "ISO-639 locales of the query, comma-separated, instead of auto-detection.",
      helpValue: "<locales>",
    }),
    hybrid: Flags.string({
      description:
        'Hybrid search as JSON, for example `{"embedder":"default","semanticRatio":0.5}`.',
      helpValue: "<json>",
    }),
    vector: Flags.string({
      description: "Query vector for a user-provided embedder, comma-separated numbers.",
      helpValue: "<numbers>",
    }),
    "exhaustive-facet-count": Flags.boolean({
      description: "Count the facet values exhaustively instead of estimating the counts.",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(FacetSearch);
    const fromFlags: Partial<SearchForFacetValuesParams> = {
      facetName: flags["facet-name"],
      facetQuery: flags["facet-query"],
      q: flags.q,
      filter: flags.filter,
      matchingStrategy: flags["matching-strategy"],
      attributesToSearchOn: flags["attributes-to-search-on"]?.split(","),
      rankingScoreThreshold: asNumber(flags["ranking-score-threshold"]) as number | undefined,
      locales: flags.locales?.split(","),
      hybrid: asJson(flags.hybrid) as HybridSearch | undefined,
      vector: flags.vector?.split(",").map(asNumber) as number[] | undefined,
      exhaustiveFacetCount: flags["exhaustive-facet-count"] ? true : undefined,
    };

    const params = readBodyWithFields(flags, fromFlags) as SearchForFacetValuesParams;

    await this.output(await this.meilisearch.index(flags.index).searchForFacetValues(params));
  }
}
