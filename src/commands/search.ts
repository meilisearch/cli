import { Flags } from "@oclif/core";
import type { SearchParams } from "meilisearch";
import { type Api, BaseCommand } from "../lib/base-command.js";
import { listFlag } from "../lib/flags.js";
import { bodyFrom } from "../lib/input.js";

export default class Search extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /indexes/{index_uid}/search"];

  static keyActions = ["search"];

  static override description =
    "Search an index, and get the hits with the API envelope around them.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies --q nosferatu",
    "<%= config.bin %> <%= command.id %> --index movies --q vampire --limit 5 --output json",
    "<%= config.bin %> <%= command.id %> --index movies --filter 'year > 1920' --sort year:asc",
    `<%= config.bin %> <%= command.id %> --index movies --data '{"q":"vampire","hybrid":{"embedder":"default"}}'`,
  ];

  static override flags = {
    index: Flags.string({
      required: true,
      description: "The index to search.",
      helpValue: "<index>",
    }),
    q: Flags.string({ description: "The search terms.", helpValue: "<query>" }),
    filter: Flags.string({
      description: "A filter expression, on the filterable attributes of the index.",
      helpValue: "<filter>",
    }),
    sort: listFlag({
      description: "Attributes to sort by, each one as attribute:asc or attribute:desc.",
      helpValue: "<attributes>",
    }),
    limit: Flags.integer({ description: "Maximum number of hits.", helpValue: "<n>" }),
    offset: Flags.integer({ description: "Number of hits to skip.", helpValue: "<n>" }),
    page: Flags.integer({
      description:
        "Page of hits to return. The envelope then carries totalHits and totalPages instead of estimatedTotalHits.",
      helpValue: "<n>",
    }),
    "hits-per-page": Flags.integer({ description: "Hits per page.", helpValue: "<n>" }),
    facets: listFlag({
      description: "Attributes to return facet counts for.",
      helpValue: "<attributes>",
    }),
    "attributes-to-retrieve": listFlag({
      description: "Attributes to keep in each hit.",
      helpValue: "<attributes>",
    }),
    "attributes-to-search-on": listFlag({
      description: "Attributes to search in, among the searchable ones.",
      helpValue: "<attributes>",
    }),
    distinct: Flags.string({
      description: "Return one hit per distinct value of this attribute.",
      helpValue: "<attribute>",
    }),
    "matching-strategy": Flags.option({
      options: ["last", "all", "frequency"] as const,
      description: "How the engine drops query terms when a document matches none of them.",
      helpValue: "<strategy>",
    })(),
    "show-ranking-score": Flags.boolean({
      description: "Add _rankingScore to every hit.",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Search);
    const params = bodyFrom<SearchParams>(flags, {
      q: flags.q,
      filter: flags.filter,
      sort: flags.sort,
      limit: flags.limit,
      offset: flags.offset,
      page: flags.page,
      hitsPerPage: flags["hits-per-page"],
      facets: flags.facets,
      attributesToRetrieve: flags["attributes-to-retrieve"],
      attributesToSearchOn: flags["attributes-to-search-on"],
      distinct: flags.distinct,
      matchingStrategy: flags["matching-strategy"],
      showRankingScore: flags["show-ranking-score"],
    });
    // index.search() builds the body as { q, ...options }: params already carries q.
    await this.output(await this.meilisearch.index(flags.index).search(params.q, params));
  }
}
