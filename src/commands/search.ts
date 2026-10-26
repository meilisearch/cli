import { Flags } from "@oclif/core";
import type { HybridSearch, SearchParams } from "meilisearch";
import { type Api, BaseCommand } from "../lib/base-command.js";
import { MeiliCliError } from "../lib/errors.js";
import { readJsonObjectBody } from "../lib/input.js";

export default class Search extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /indexes/{index_uid}/search"];

  static keyActions = ["search"];

  static override description =
    "Search the documents of an index, with --q and the search parameters of the route.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies --q nosferatu",
    "<%= config.bin %> <%= command.id %> --index movies --q nosferatu --output json",
    "<%= config.bin %> <%= command.id %> --index movies --q horror --filter 'rating > 4' --sort rating:desc --limit 5",
    "<%= config.bin %> <%= command.id %> --index movies --facets genres --attributes-to-retrieve id,title",
    '<%= config.bin %> <%= command.id %> --index movies --data \'{"q":"nosferatu","hybrid":{"embedder":"default","semanticRatio":0.5}}\'',
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      required: true,
      description: "The index to search in.",
      helpValue: "<index>",
    }),
    q: Flags.string({
      description: "The search terms. Omit it for a placeholder search, which returns everything.",
      helpValue: "<query>",
    }),
    offset: Flags.integer({
      description: "Number of documents to skip. Ignored when --page or --hits-per-page is given.",
      helpValue: "<n>",
    }),
    limit: Flags.integer({
      description:
        "Maximum number of documents to return, 20 by default. Ignored when --page or --hits-per-page is given.",
      helpValue: "<n>",
    }),
    page: Flags.integer({
      description:
        "Page to return, 1-indexed. The response then carries totalHits and totalPages instead of estimatedTotalHits.",
      helpValue: "<n>",
    }),
    "hits-per-page": Flags.integer({
      description:
        "Number of documents per page, used with --page. 0 counts without returning any.",
      helpValue: "<n>",
    }),
    "attributes-to-retrieve": Flags.string({
      description:
        "Document attributes to return, comma-separated. Defaults to the displayed ones.",
      helpValue: "<fields>",
    }),
    "attributes-to-crop": Flags.string({
      description:
        "Attributes to crop in _formatted, comma-separated, each optionally as `attribute:length`.",
      helpValue: "<fields>",
    }),
    "crop-length": Flags.integer({
      description: "Maximum number of words in a cropped value, 10 by default.",
      helpValue: "<n>",
    }),
    "crop-marker": Flags.string({
      description: "String marking where a cropped value was cut, `…` by default.",
      helpValue: "<string>",
    }),
    "attributes-to-highlight": Flags.string({
      description: "Attributes to highlight in _formatted, comma-separated.",
      helpValue: "<fields>",
    }),
    "highlight-pre-tag": Flags.string({
      description: "String inserted before each highlighted term, `<em>` by default.",
      helpValue: "<string>",
    }),
    "highlight-post-tag": Flags.string({
      description: "String inserted after each highlighted term, `</em>` by default.",
      helpValue: "<string>",
    }),
    "show-matches-position": Flags.boolean({
      description: "Add _matchesPosition to each hit, the byte offset of every matched term.",
    }),
    filter: Flags.string({
      description:
        "Filter expression, for example `rating > 4`. Its array-of-arrays form goes through --data.",
      helpValue: "<filter>",
    }),
    sort: Flags.string({
      description: "Attributes to sort on, comma-separated, each as `attribute:asc` or `:desc`.",
      helpValue: "<sort>",
    }),
    distinct: Flags.string({
      description: "Return one document per value of this attribute, which must be filterable.",
      helpValue: "<attribute>",
    }),
    facets: Flags.string({
      description:
        "Attributes to count in facetDistribution, comma-separated. Patterns such as `*` are accepted.",
      helpValue: "<facets>",
    }),
    "matching-strategy": Flags.option({
      options: ["last", "all", "frequency"] as const,
      description: "How query terms are relaxed when there are not enough results.",
    })(),
    "attributes-to-search-on": Flags.string({
      description: "Restrict the search to these searchable attributes, comma-separated.",
      helpValue: "<fields>",
    }),
    "ranking-score-threshold": Flags.string({
      description: "Drop the hits whose ranking score is below this value, between 0.0 and 1.0.",
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
    "retrieve-vectors": Flags.boolean({
      description: "Add _vectors to each hit, the embeddings of the document.",
    }),
    "show-ranking-score": Flags.boolean({
      description: "Add _rankingScore to each hit, between 0.0 and 1.0.",
    }),
    "show-ranking-score-details": Flags.boolean({
      description: "Add _rankingScoreDetails to each hit, the score of every ranking rule.",
    }),
    "show-performance-details": Flags.boolean({
      description: "Add performanceDetails to the response, a timing breakdown of the query.",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Search);
    const fromFlags: SearchParams = {
      q: flags.q,
      offset: flags.offset,
      limit: flags.limit,
      page: flags.page,
      hitsPerPage: flags["hits-per-page"],
      attributesToRetrieve: flags["attributes-to-retrieve"]?.split(","),
      attributesToCrop: flags["attributes-to-crop"]?.split(","),
      cropLength: flags["crop-length"],
      cropMarker: flags["crop-marker"],
      attributesToHighlight: flags["attributes-to-highlight"]?.split(","),
      highlightPreTag: flags["highlight-pre-tag"],
      highlightPostTag: flags["highlight-post-tag"],
      showMatchesPosition: flags["show-matches-position"] ? true : undefined,
      filter: flags.filter,
      sort: flags.sort?.split(","),
      distinct: flags.distinct,
      facets: flags.facets?.split(","),
      matchingStrategy: flags["matching-strategy"],
      attributesToSearchOn: flags["attributes-to-search-on"]?.split(","),
      rankingScoreThreshold:
        flags["ranking-score-threshold"] === undefined
          ? undefined
          : toNumber(flags["ranking-score-threshold"], "ranking-score-threshold"),
      locales: flags.locales?.split(","),
      hybrid: flags.hybrid === undefined ? undefined : toJson<HybridSearch>(flags.hybrid, "hybrid"),
      vector: flags.vector?.split(",").map((part) => toNumber(part, "vector")),
      retrieveVectors: flags["retrieve-vectors"] ? true : undefined,
      showRankingScore: flags["show-ranking-score"] ? true : undefined,
      showRankingScoreDetails: flags["show-ranking-score-details"] ? true : undefined,
      showPerformanceDetails: flags["show-performance-details"] ? true : undefined,
    };

    // The body of --file or --data first, then the flags, which override a field of it (rule 8).
    // The undefined entries are dropped rather than spread: an absent flag would otherwise
    // erase the field the body carries, since JSON.stringify leaves an undefined value out.
    const params = {
      ...readJsonObjectBody(flags),
      ...Object.fromEntries(Object.entries(fromFlags).filter(([, value]) => value !== undefined)),
    } as SearchParams;

    await this.output(await this.meilisearch.index(flags.index).search(undefined, params));
  }
}

/** A flag the route types as a number: the API refuses the string a flag carries. */
function toNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isFinite(parsed)) {
    throw new MeiliCliError("cli_usage", `--${flag} must be a number, got \`${value}\`.`);
  }
  return parsed;
}

/** A flag the route types as an object: it travels as JSON text (rule 7). The API checks its shape. */
function toJson<T>(value: string, flag: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (cause) {
    throw new MeiliCliError("cli_usage", `--${flag} must be JSON text.`, { cause });
  }
}
