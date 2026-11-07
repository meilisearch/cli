import { Flags } from "@oclif/core";
import type { RecordAny } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { MeiliCliError } from "../../lib/errors.js";
import { readJsonBody } from "../../lib/input.js";

export default class DocumentUpdate extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["PUT /indexes/{index_uid}/documents"];

  static keyActions = ["documents.add"];

  static override description = `Add or update documents in an index.

The fields of a document are merged into the one that has the same primary key.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --index movies --file changes.json",
    "cat changes.json | <%= config.bin %> <%= command.id %> -p prod -i movies --file -",
    '<%= config.bin %> <%= command.id %> -p prod -i movies --data \'[{"id":1,"rating":4}]\'',
    "<%= config.bin %> <%= command.id %> -p prod -i movies --file changes.json --wait",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      char: "i",
      required: true,
      description: "The index to update the documents of.",
      helpValue: "<index>",
    }),
    "primary-key": Flags.string({
      description: "Primary key of the index. Only taken into account on its first documents.",
      helpValue: "<field>",
    }),
    "custom-metadata": Flags.string({
      description: "String attached to the task, returned in the task object.",
      helpValue: "<string>",
    }),
    "skip-creation": Flags.boolean({
      description: "Only update documents that already exist, ignore the new ones.",
    }),
    ...BaseCommand.bodyInputFlags,
    ...BaseCommand.waitFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DocumentUpdate);
    const documents = readJsonBody(flags);
    if (documents === undefined) {
      throw new MeiliCliError("cli_usage", "The documents to update are missing.", {
        hint: "Pass them with `--file <path>`, `--file -` to read stdin, or `--data '<json>'`.",
      });
    }
    const task = await this.meilisearch
      .index(flags.index)
      .updateDocuments(documents as RecordAny[], {
        primaryKey: flags["primary-key"],
        customMetadata: flags["custom-metadata"],
        skipCreation: flags["skip-creation"] ? true : undefined,
      });
    await this.outputTask(task, flags, {
      enqueued: (uid) =>
        `Meilisearch received the changes. Task ${uid} will update documents in index ${flags.index}.`,
      pending: "The documents keep their old values until the task succeeds. Follow it:",
      succeeded: ({ details }) =>
        `${details?.indexedDocuments} of ${details?.receivedDocuments} documents updated in index ${flags.index}.`,
    });
  }
}
