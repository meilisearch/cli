import { Flags } from "@oclif/core";
import type { MultiSearchParams } from "meilisearch";
import { type Api, BaseCommand } from "../lib/base-command.js";
import { readJsonObjectBody } from "../lib/input.js";
import { asJson } from "../lib/values.js";

export default class MultiSearch extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /multi-search"];

  static keyActions = ["search"];

  static override description =
    "Run several search queries in one request, each naming its index in --queries, returned side by side or merged into one ranked list with --federation.";

  static override examples = [
    '<%= config.bin %> <%= command.id %> --queries \'[{"indexUid":"movies","q":"nosferatu"},{"indexUid":"books","q":"nosferatu"}]\'',
    '<%= config.bin %> <%= command.id %> --queries \'[{"indexUid":"movies","q":"nosferatu"}]\' --output json',
    '<%= config.bin %> <%= command.id %> --queries \'[{"indexUid":"movies","q":"horror"},{"indexUid":"books","q":"horror"}]\' --federation \'{"limit":5}\'',
    "cat queries.json | <%= config.bin %> <%= command.id %> --file -",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    queries: Flags.string({
      description:
        'The search queries as a JSON array, each one an index to search and its search parameters: `[{"indexUid":"movies","q":"nosferatu"}]`.',
      helpValue: "<json>",
    }),
    federation: Flags.string({
      description:
        'Merge the hits of every query into one ranked list, as JSON: `{}` for the defaults, `{"limit":5}` to narrow it. Without it each query answers its own envelope.',
      helpValue: "<json>",
    }),
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MultiSearch);
    // The body of --file or --data first, then the flags, which override a field of it (rule 8).
    const params = { ...readJsonObjectBody(flags) };
    if (flags.queries !== undefined) params.queries = asJson(flags.queries);
    if (flags.federation !== undefined) params.federation = asJson(flags.federation);

    await this.output(await this.meilisearch.multiSearch(params as MultiSearchParams));
  }
}
