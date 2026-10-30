import { Flags } from "@oclif/core";
import type { Settings } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { readBodyWithFields } from "../../lib/input.js";
import { asJson, asList, asNumber, asText } from "../../lib/values.js";

export default class UpdateSettings extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["PATCH /indexes/{index_uid}/settings"];

  static keyActions = ["settings.update"];

  static override description =
    "Change the settings given, leave the others as they are, and reset one with the value null.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies --searchable-attributes title,overview",
    "<%= config.bin %> <%= command.id %> --index movies --filterable-attributes genres,release_date --output json",
    "<%= config.bin %> <%= command.id %> --index movies --stop-words null",
    "<%= config.bin %> <%= command.id %> --index movies --typo-tolerance '{\"enabled\":false}' --wait",
    "<%= config.bin %> <%= command.id %> --index movies --file settings.json",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      required: true,
      description: "The index to update the settings of.",
      helpValue: "<index>",
    }),
    "displayed-attributes": Flags.string({
      description: "Fields returned in search results, comma-separated.",
      helpValue: "<fields>",
    }),
    "searchable-attributes": Flags.string({
      description:
        "Fields searched for query words, comma-separated, in order of importance for the ranking.",
      helpValue: "<fields>",
    }),
    "filterable-attributes": Flags.string({
      description:
        "Attributes usable as filters and facets, comma-separated. Their rule form goes through --data.",
      helpValue: "<fields>",
    }),
    "sortable-attributes": Flags.string({
      description: "Attributes usable to sort the search results, comma-separated.",
      helpValue: "<fields>",
    }),
    "foreign-keys": Flags.string({
      description:
        'Foreign keys for cross-index filtering, as JSON: `[{"foreignIndexUid":"products","fieldName":"productId"}]`.',
      helpValue: "<json>",
    }),
    "ranking-rules": Flags.string({
      description:
        "Ranking rules in order of importance, comma-separated, built-in or `attribute:asc` and `:desc`.",
      helpValue: "<rules>",
    }),
    "stop-words": Flags.string({
      description: "Words ignored when they appear in a search query, comma-separated.",
      helpValue: "<words>",
    }),
    "non-separator-tokens": Flags.string({
      description:
        "Characters removed from the default separators, comma-separated, so that they no longer split words.",
      helpValue: "<tokens>",
    }),
    "separator-tokens": Flags.string({
      description: "Characters added to the default separators, comma-separated.",
      helpValue: "<tokens>",
    }),
    dictionary: Flags.string({
      description: "Strings parsed as a single term, comma-separated, such as names.",
      helpValue: "<words>",
    }),
    synonyms: Flags.string({
      description: 'Words treated as equivalent, as JSON: `{"phone":["iPhone"]}`.',
      helpValue: "<json>",
    }),
    "distinct-attribute": Flags.string({
      description: "Field whose value must be unique in the returned documents.",
      helpValue: "<attribute>",
    }),
    "proximity-precision": Flags.string({
      description:
        "Precision of the proximity ranking rule, `byWord` or `byAttribute`, which indexes faster.",
      helpValue: "<precision>",
    }),
    "typo-tolerance": Flags.string({
      description: 'Typo tolerance as JSON, for example `{"enabled":false}`.',
      helpValue: "<json>",
    }),
    faceting: Flags.string({
      description: 'Faceting as JSON, for example `{"maxValuesPerFacet":200}`.',
      helpValue: "<json>",
    }),
    pagination: Flags.string({
      description: 'Pagination as JSON, for example `{"maxTotalHits":2000}`.',
      helpValue: "<json>",
    }),
    embedders: Flags.string({
      description:
        'Embedders as JSON, a map of name to configuration: `{"default":{"source":"openAi"}}`.',
      helpValue: "<json>",
    }),
    "search-cutoff-ms": Flags.string({
      description: "Maximum duration of a search in milliseconds, 1500 when it is null.",
      helpValue: "<ms>",
    }),
    "localized-attributes": Flags.string({
      description:
        'Locales of the attributes, as JSON: `[{"locales":["jpn"],"attributePatterns":["*_ja"]}]`.',
      helpValue: "<json>",
    }),
    "facet-search": Flags.string({
      description: "Whether the facet-search route is enabled on this index, `true` or `false`.",
      helpValue: "<boolean>",
    }),
    "prefix-search": Flags.string({
      description:
        "When prefix matches are computed, `indexingTime` or `disabled`, which indexes faster.",
      helpValue: "<mode>",
    }),
    chat: Flags.string({
      description:
        'Chat settings as JSON, for example `{"description":"A movie database"}`, which the LLM reads.',
      helpValue: "<json>",
    }),
    ...BaseCommand.bodyInputFlags,
    ...BaseCommand.waitFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(UpdateSettings);
    const fromFlags: Record<string, unknown> = {
      displayedAttributes: asList(flags["displayed-attributes"]),
      searchableAttributes: asList(flags["searchable-attributes"]),
      filterableAttributes: asList(flags["filterable-attributes"]),
      sortableAttributes: asList(flags["sortable-attributes"]),
      foreignKeys: asJson(flags["foreign-keys"]),
      rankingRules: asList(flags["ranking-rules"]),
      stopWords: asList(flags["stop-words"]),
      nonSeparatorTokens: asList(flags["non-separator-tokens"]),
      separatorTokens: asList(flags["separator-tokens"]),
      dictionary: asList(flags.dictionary),
      synonyms: asJson(flags.synonyms),
      distinctAttribute: asText(flags["distinct-attribute"]),
      proximityPrecision: asText(flags["proximity-precision"]),
      typoTolerance: asJson(flags["typo-tolerance"]),
      faceting: asJson(flags.faceting),
      pagination: asJson(flags.pagination),
      embedders: asJson(flags.embedders),
      searchCutoffMs: asNumber(flags["search-cutoff-ms"]),
      localizedAttributes: asJson(flags["localized-attributes"]),
      facetSearch: asJson(flags["facet-search"]),
      prefixSearch: asText(flags["prefix-search"]),
      chat: asJson(flags.chat),
    };

    const settings = readBodyWithFields(flags, fromFlags) as Settings;

    await this.outputTask(
      await this.meilisearch.index(flags.index).updateSettings(settings),
      flags,
    );
  }
}
