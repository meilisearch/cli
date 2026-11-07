import { type Api, BaseCommand } from "../../lib/base-command.js";
import { fetchKeys } from "../../lib/clients/meilisearch.js";
import { defaultView } from "../../lib/human.js";
import { type HumanView, paint } from "../../lib/output.js";
import type { ListPage } from "../../lib/pagination.js";

/** The length a description keeps in the table, ellipsis included. */
const DESCRIPTION_LENGTH = 30;

export default class KeyList extends BaseCommand {
  static api: Api = "meilisearch";

  static routes = ["GET /keys"];

  static keyActions = ["keys.get"];

  static override description = `List the API keys of the instance.

The answer is the API body as it is, so it carries the \`key\` field of every key it returns: credentials that work, on stdout, like any other data.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %> --project prod",
    "<%= config.bin %> <%= command.id %> -p prod --limit 5 --offset 10",
  ];

  static override flags = {
    ...BaseCommand.connectionFlags,
    ...BaseCommand.paginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(KeyList);
    await this.outputList(
      (query) => fetchKeys(this.meilisearch, query),
      { limit: flags.limit, offset: flags.offset },
      flags.all,
      view,
    );
  }
}

/**
 * The default table, without the uid, the indexes and actions right after the
 * description, each description cut to its first characters, and a line that
 * says so.
 */
function view(page: ListPage): HumanView {
  let cut = false;
  const results = (page.results as Record<string, unknown>[]).map(
    ({ uid: _uid, name, description, indexes, actions, ...rest }) => {
      const long = typeof description === "string" && description.length > DESCRIPTION_LENGTH;
      if (long) cut = true;
      return {
        name,
        description: long ? `${description.slice(0, DESCRIPTION_LENGTH - 1)}…` : description,
        indexes,
        actions,
        ...rest,
      };
    },
  );
  const shown = defaultView({ ...page, results });
  if (!cut) return shown;
  return {
    ...shown,
    next: [
      ...(shown.next ?? []),
      `${paint("dim", "Descriptions are cut. See one in full:")} meili key view --id <key>`,
    ],
  };
}
