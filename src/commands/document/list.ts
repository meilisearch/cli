import { Flags } from "@oclif/core";
import type { DocumentsQuery } from "meilisearch";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { fetchDocuments } from "../../lib/clients/meilisearch.js";
import { MeiliCliError } from "../../lib/errors.js";
import { commandLine, simpleValue, table } from "../../lib/human.js";
import { isJsonObject, readJsonBody } from "../../lib/input.js";
import { type HumanView, paint } from "../../lib/output.js";

export default class DocumentList extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["POST /indexes/{index_uid}/documents/fetch"];

  static keyActions = ["documents.get"];

  static override description = `List the documents of an index.

--ids or --filter narrow the list.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod --index movies",
    "<%= config.bin %> <%= command.id %> -p prod -i movies --ids 42,1344 --fields id,title",
    "<%= config.bin %> <%= command.id %> -p prod -i movies --filter 'rating > 4' --sort rating:desc",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    index: Flags.string({
      char: "i",
      required: true,
      description: "The index to read the documents from.",
      helpValue: "<index>",
    }),
    ids: Flags.string({
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
    limit: BaseCommand.paginationFlags.limit,
    offset: BaseCommand.paginationFlags.offset,
    ...BaseCommand.bodyInputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DocumentList);
    const given = readJsonBody(flags);
    if (given !== undefined && !isJsonObject(given)) {
      throw new MeiliCliError(
        "cli_input_invalid",
        "The body of `document list` is the query object of POST /indexes/{index_uid}/documents/fetch, not an array.",
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

    await this.output(
      (await fetchDocuments(this.meilisearch, flags.index, query)) as DocumentsPage,
      (page) => view(page, query, flags.index, this.argv),
    );
  }
}

type DocumentsPage = {
  results: Record<string, unknown>[];
  offset: number;
  limit: number;
  total: number;
};

/**
 * The page as a table: the attributes the query chose, or else the first ones
 * with a simple value, at most 4. The headers keep the attribute names, which
 * `--fields` takes.
 */
function view(
  { results, offset, total }: DocumentsPage,
  query: DocumentsQuery,
  index: string,
  argv: string[],
): HumanView {
  const filter = typeof query.filter === "string" ? query.filter : undefined;
  if (results.length === 0) {
    if (total > 0) return { next: [`No documents from offset ${offset}: there are ${total}.`] };
    if (query.filter !== undefined || query.ids !== undefined) {
      return { next: [`No documents match ${filter ?? "the query"} in index ${index}.`] };
    }
    return {
      next: [
        `Index ${index} has no documents. Add some: meili document add -i ${index} --file <path>`,
      ],
    };
  }
  const attributes = [...new Set(results.flatMap((document) => Object.keys(document)))];
  const shown =
    query.fields === undefined
      ? attributes
          .filter((name) =>
            results.every(
              (document) => document[name] === null || typeof document[name] !== "object",
            ),
          )
          .slice(0, 4)
      : attributes;
  const end = offset + results.length;
  const next: string[] = [];
  if (shown.length < attributes.length) {
    next.push(
      `${paint("dim", `Simplified view: ${shown.length} of ${attributes.length} attributes. Choose them with`)} --fields${paint("dim", ", or see them all with")} --json${paint("dim", ".")}`,
    );
  }
  if (end < total) next.push(`${paint("dim", "Next page:")} ${nextPage(argv, end)}`);
  else if (offset > 0) next.push(paint("dim", "This is the last page."));
  return {
    status: [
      paint(
        "bold",
        `Showing documents ${offset + 1}–${end} of ${total} in index ${index}${filter === undefined ? "" : `, filtered by ${filter}`}`,
      ),
    ],
    data: table(
      shown,
      results.map((document) =>
        shown.map((name) =>
          document[name] === undefined
            ? ""
            : (simpleValue(document[name]) ?? JSON.stringify(document[name])),
        ),
      ),
    ),
    next,
  };
}

/** The command line as it was typed, at another offset, without the API key it may hold. */
function nextPage(argv: string[], offset: number): string {
  const args = ["document", "list"];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const name = arg.split("=")[0];
    if (name !== "--offset" && name !== "--project-api-key") {
      args.push(arg);
      continue;
    }
    if (!arg.includes("=")) i += 1;
    if (name === "--project-api-key") args.push(name, "<key>");
  }
  return commandLine([...args, "--offset", String(offset)]);
}
