import { Flags } from "@oclif/core";
import type { DocumentQuery } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";

export default class DocumentView extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /indexes/{index_uid}/documents/{document_id}"];

  static keyActions = ["documents.get"];

  static override description = "Get one document of an index.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --index movies --id 42",
    "<%= config.bin %> <%= command.id %> -p prod --index movies --id 42 --fields id,title",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      required: true,
      description: "The index to read the document from.",
      helpValue: "<index>",
    }),
    id: Flags.string({
      required: true,
      description: "The document identifier.",
      helpValue: "<id>",
    }),
    fields: Flags.string({
      description: "Document attributes to return, comma-separated. Defaults to all of them.",
      helpValue: "<fields>",
    }),
    "retrieve-vectors": Flags.boolean({
      description: "Include the vector embeddings of the document, if it has them.",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DocumentView);
    // meilisearch-js does not type `retrieveVectors`, and sends it as a query parameter all the same.
    const query = {
      fields: flags.fields?.split(","),
      retrieveVectors: flags["retrieve-vectors"] ? true : undefined,
    } as DocumentQuery;
    await this.output(await this.meilisearch.index(flags.index).getDocument(flags.id, query));
  }
}
