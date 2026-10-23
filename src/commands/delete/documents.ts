import { Flags } from "@oclif/core";
import type { DocumentsIds, Filter } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { MeiliCliError } from "../../lib/errors.js";
import { isJsonObject, readJsonBody } from "../../lib/input.js";

export default class DeleteDocuments extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = [
    "DELETE /indexes/{index_uid}/documents",
    "POST /indexes/{index_uid}/documents/delete",
    "POST /indexes/{index_uid}/documents/delete-batch",
  ];

  static keyActions = ["documents.delete"];

  static override description =
    "Delete the documents of an index named by --ids, matched by --filter, or every one of them with --all.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies --ids 42,1344 --yes",
    "<%= config.bin %> <%= command.id %> --index movies --ids 42 --yes --output json",
    "<%= config.bin %> <%= command.id %> --index movies --filter 'rating < 2' --yes",
    "<%= config.bin %> <%= command.id %> --index movies --file ids.json --yes",
    "<%= config.bin %> <%= command.id %> --index movies --all --yes --wait",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      required: true,
      description: "The index to delete the documents from.",
      helpValue: "<index>",
    }),
    ids: Flags.string({
      aliases: ["id"],
      exclusive: ["filter", "all"],
      description: "Document identifiers to delete, comma-separated.",
      helpValue: "<ids>",
    }),
    filter: Flags.string({
      exclusive: ["ids", "all"],
      description:
        "Delete the documents matching this filter expression, for example `rating < 2`.",
      helpValue: "<filter>",
    }),
    all: Flags.boolean({
      exclusive: ["ids", "filter", "file", "data"],
      description: "Delete every document of the index.",
    }),
    "custom-metadata": Flags.string({
      description: "String attached to the task, returned in the task object.",
      helpValue: "<string>",
    }),
    ...BaseCommand.bodyInputFlags,
    ...BaseCommand.waitFlags,
    ...BaseCommand.confirmFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DeleteDocuments);
    const index = this.meilisearch.index(flags.index);
    const options = { customMetadata: flags["custom-metadata"] };

    if (flags.all) {
      await this.outputTask(await index.deleteAllDocuments(options), flags);
      return;
    }

    // The body of the two POST routes is the selector itself: an array of
    // identifiers for delete-batch, `{ "filter": … }` for delete. A flag
    // overrides it, as it overrides any body field.
    const body = readJsonBody(flags);
    const ids: DocumentsIds | undefined =
      flags.ids?.split(",") ?? (Array.isArray(body) ? (body as DocumentsIds) : undefined);
    const filter: Filter | undefined =
      flags.filter ?? (isJsonObject(body) ? (body.filter as Filter | undefined) : undefined);

    if (ids !== undefined && filter !== undefined) {
      throw new MeiliCliError(
        "cli_usage",
        "Identifiers and a filter select two different routes. Pass only one of them.",
      );
    }
    if (ids !== undefined) {
      await this.outputTask(await index.deleteDocuments(ids, options), flags);
      return;
    }
    if (filter !== undefined) {
      await this.outputTask(await index.deleteDocuments({ filter }, options), flags);
      return;
    }
    throw new MeiliCliError("cli_usage", "The documents to delete are missing.", {
      hint: "Name them with `--ids <ids>` or `--filter <filter>`, or delete every document with `--all`.",
    });
  }
}
