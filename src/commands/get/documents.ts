import { Flags } from "@oclif/core";
import type { DocumentsQuery } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { listFlag } from "../../lib/flags.js";
import { bodyFrom } from "../../lib/input.js";
import { type ListPage, nextOffsetQuery } from "../../lib/pagination.js";

export default class GetDocuments extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /indexes/{index_uid}/documents/fetch"];

  static keyActions = ["documents.get"];

  static override description =
    "List the documents of an index, or the ones --ids or --filter selects.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies --limit 5 --output json",
    "<%= config.bin %> <%= command.id %> --index movies --ids 1,2",
    "<%= config.bin %> <%= command.id %> --index movies --filter 'year > 1920' --fields id,title",
    "<%= config.bin %> <%= command.id %> --index movies --all --output ndjson",
  ];

  static override flags = {
    index: Flags.string({
      required: true,
      description: "The index to read the documents from.",
      helpValue: "<index>",
    }),
    ids: listFlag({
      aliases: ["id"],
      description: "Identifiers of the documents to return.",
      helpValue: "<ids>",
    }),
    filter: Flags.string({
      description: "A filter expression, on the filterable attributes of the index.",
      helpValue: "<filter>",
    }),
    fields: listFlag({
      description: "Attributes to keep in each document.",
      helpValue: "<attributes>",
    }),
    sort: listFlag({
      description: "Attributes to sort by, each one as attribute:asc or attribute:desc.",
      helpValue: "<attributes>",
    }),
    "retrieve-vectors": Flags.boolean({
      description: "Add the embeddings of each document under _vectors.",
    }),
    ...BaseCommand.paginationFlags,
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetDocuments);
    const body = bodyFrom<DocumentsQuery>(flags, {
      ids: flags.ids,
      filter: flags.filter,
      fields: flags.fields,
      sort: flags.sort,
      retrieveVectors: flags["retrieve-vectors"],
    });
    // The route is a POST that lists: every filter travels in its body, next to the page.
    await this.outputList(
      (page) =>
        this.meilisearch.httpRequest.post<ListPage>({
          path: `indexes/${flags.index}/documents/fetch`,
          body: { ...body, ...page },
        }),
      { limit: flags.limit, offset: flags.offset },
      flags.all,
      nextOffsetQuery,
    );
  }
}
