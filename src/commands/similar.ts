import { Flags } from "@oclif/core";
import type { SearchSimilarDocumentsParams } from "meilisearch";
import { type Api, BaseCommand } from "../lib/base-command.js";
import { readJsonObjectBody } from "../lib/input.js";
import { asNumber } from "../lib/values.js";

export default class Similar extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /indexes/{index_uid}/similar"];

  static keyActions = ["search"];

  static override description =
    "Find the documents an index holds that are closest to one of its documents, named by --id and compared with --embedder.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies --id 143 --embedder default",
    "<%= config.bin %> <%= command.id %> --index movies --id 143 --embedder default --output json",
    "<%= config.bin %> <%= command.id %> --index movies --id 143 --embedder default --filter 'genres = horror' --limit 5",
    '<%= config.bin %> <%= command.id %> --index movies --data \'{"id":143,"embedder":"default","retrieveVectors":true}\'',
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      required: true,
      description: "The index to search in.",
      helpValue: "<index>",
    }),
    id: Flags.string({
      description: "The document to compare with, by its primary key value.",
      helpValue: "<id>",
    }),
    embedder: Flags.string({
      description:
        "The embedder the similarity is computed with, one of those the index settings configure.",
      helpValue: "<embedder>",
    }),
    offset: Flags.integer({
      description: "Number of documents to skip.",
      helpValue: "<n>",
    }),
    limit: Flags.integer({
      description: "Maximum number of documents to return, 20 by default.",
      helpValue: "<n>",
    }),
    filter: Flags.string({
      description:
        "Filter expression, for example `genres = horror`. Its array-of-arrays form goes through --data.",
      helpValue: "<filter>",
    }),
    "attributes-to-retrieve": Flags.string({
      description:
        "Document attributes to return, comma-separated. Defaults to the displayed ones.",
      helpValue: "<fields>",
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
    "ranking-score-threshold": Flags.string({
      description: "Drop the hits whose ranking score is below this value, between 0.0 and 1.0.",
      helpValue: "<number>",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Similar);
    // Not typed against SearchSimilarDocumentsParams, unlike the flag object of `search`:
    // the SDK type has no retrieveVectors, which SimilarQuery of the document declares.
    const fromFlags = {
      id: flags.id,
      embedder: flags.embedder,
      offset: flags.offset,
      limit: flags.limit,
      filter: flags.filter,
      attributesToRetrieve: flags["attributes-to-retrieve"]?.split(","),
      retrieveVectors: flags["retrieve-vectors"] ? true : undefined,
      showRankingScore: flags["show-ranking-score"] ? true : undefined,
      showRankingScoreDetails: flags["show-ranking-score-details"] ? true : undefined,
      showPerformanceDetails: flags["show-performance-details"] ? true : undefined,
      rankingScoreThreshold: asNumber(flags["ranking-score-threshold"]),
    };

    // The body of --file or --data first, then the flags, which override a field of it (rule 8).
    // The undefined entries are dropped rather than spread: an absent flag would otherwise
    // erase the field the body carries, since JSON.stringify leaves an undefined value out.
    const params = {
      ...readJsonObjectBody(flags),
      ...Object.fromEntries(Object.entries(fromFlags).filter(([, value]) => value !== undefined)),
    } as SearchSimilarDocumentsParams;

    await this.output(await this.meilisearch.index(flags.index).searchSimilarDocuments(params));
  }
}
