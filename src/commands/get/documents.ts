import { Flags } from "@oclif/core";
import type { DocumentsQuery } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { fetchDocuments } from "../../lib/clients/meilisearch.js";
import { MeiliCliError } from "../../lib/errors.js";
import { isJsonObject, readJsonBody } from "../../lib/input.js";

export default class GetDocuments extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /indexes/{index_uid}/documents/fetch"];

  static keyActions = ["documents.get"];

  static override description = "List the documents of an index, narrowed by --ids or by --filter.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies",
    "<%= config.bin %> <%= command.id %> --index movies --output json",
    "<%= config.bin %> <%= command.id %> --index movies --ids 42,1344 --fields id,title",
    "<%= config.bin %> <%= command.id %> --index movies --filter 'rating > 4' --sort rating:desc",
    "<%= config.bin %> <%= command.id %> --index movies --all --output ndjson",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      required: true,
      description: "The index to read the documents from.",
      helpValue: "<index>",
    }),
    ids: Flags.string({
      aliases: ["id"],
      description: "Document identifiers to return, comma-separated.",
      helpValue: "<ids>",
    }),
    filter: Flags.string({
      description:
        "Filter expression, for example `rating > 4`. Its array-of-arrays form goes through --data.",
      helpValue: "<filter>",
    }),
    fields: Flags.string({
      description: "Document attributes to return, comma-separated. Defaults to all of them.",
      helpValue: "<fields>",
    }),
    sort: Flags.string({
      description: "Attributes to sort on, comma-separated, each as `attribute:asc` or `:desc`.",
      helpValue: "<sort>",
    }),
    "retrieve-vectors": Flags.boolean({
      description: "Include the vector embeddings of the documents that have them.",
    }),
    ...BaseCommand.paginationFlags,
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetDocuments);
    const given = readJsonBody(flags);
    if (given !== undefined && !isJsonObject(given)) {
      throw new MeiliCliError(
        "cli_input_invalid",
        "The body of `get documents` is the query object of POST /indexes/{index_uid}/documents/fetch, not an array.",
        { hint: "Pass the identifiers as `--data '{\"ids\":[42,1344]}'` or as `--ids 42,1344`." },
      );
    }

    const query = { ...given } as DocumentsQuery;
    if (flags.ids !== undefined) query.ids = flags.ids.split(",");
    if (flags.filter !== undefined) query.filter = flags.filter;
    if (flags.fields !== undefined) query.fields = flags.fields.split(",");
    if (flags.sort !== undefined) query.sort = flags.sort.split(",");
    if (flags["retrieve-vectors"]) query.retrieveVectors = true;
    if (flags.limit !== undefined) query.limit = flags.limit;
    if (flags.offset !== undefined) query.offset = flags.offset;

    const { limit, offset, ...rest } = query;
    await this.outputList(
      (page) => fetchDocuments(this.meilisearch, flags.index, { ...rest, ...page }),
      { limit, offset },
      flags.all,
    );
  }
}
