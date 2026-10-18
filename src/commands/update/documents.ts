import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { readBodyArrayInput } from "../../lib/input.js";

export default class UpdateDocuments extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["PUT /indexes/{index_uid}/documents"];

  static keyActions = ["documents.add"];

  static override description =
    "Update documents of an index, merging each one into the stored document that shares its identifier.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies --file patch.json",
    "<%= config.bin %> <%= command.id %> --index movies --file - --wait --output json",
    `<%= config.bin %> <%= command.id %> --index movies --data '[{"id":1,"rating":9}]'`,
  ];

  static override flags = {
    index: Flags.string({
      required: true,
      description: "The index the documents go to.",
      helpValue: "<index>",
    }),
    "primary-key": Flags.string({
      description:
        "The field that holds the identifier of each document. Only read the first time documents are added to the index.",
      helpValue: "<field>",
    }),
    "skip-creation": Flags.boolean({
      description: "Only update documents that already exist, and ignore the others.",
    }),
    "custom-metadata": Flags.string({
      description: "A string stored with the task, to recognize it later.",
      helpValue: "<text>",
    }),
    ...BaseCommand.bodyInputFlags,
    ...BaseCommand.waitFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(UpdateDocuments);
    const documents = readBodyArrayInput(flags);
    const task = await this.meilisearch.index(flags.index).updateDocuments(documents, {
      primaryKey: flags["primary-key"],
      skipCreation: flags["skip-creation"],
      customMetadata: flags["custom-metadata"],
    });
    await this.outputTask(task, flags);
  }
}
