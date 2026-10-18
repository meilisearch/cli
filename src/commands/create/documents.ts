import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { readBodyArrayInput } from "../../lib/input.js";

export default class CreateDocuments extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /indexes/{index_uid}/documents"];

  static keyActions = ["documents.add"];

  static override description =
    "Add documents to an index, replacing the stored document when one shares the same identifier.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --index movies --file movies.json",
    "<%= config.bin %> <%= command.id %> --index movies --file - --wait --output json",
    `<%= config.bin %> <%= command.id %> --index movies --data '[{"id":1,"title":"Nosferatu"}]' --primary-key id`,
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
    const { flags } = await this.parse(CreateDocuments);
    const documents = readBodyArrayInput(flags);
    const task = await this.meilisearch.index(flags.index).addDocuments(documents, {
      primaryKey: flags["primary-key"],
      skipCreation: flags["skip-creation"],
      customMetadata: flags["custom-metadata"],
    });
    await this.outputTask(task, flags);
  }
}
