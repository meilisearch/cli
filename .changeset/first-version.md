---
"@meilisearch/cli": minor
---

First version of `meili`, the Meilisearch CLI built for coding agents.

- Commands derive from the routes of the Meilisearch API and of the Management API, verb first and resource plural: `meili get health`, `meili get indexes`, `meili get indexes --id movies`.
- Documents: `meili get documents --index <index>`, narrowed by `--ids` or `--filter`; `meili add documents --index <index> --file <path>` and `meili update documents --index <index> --file <path>`, which read the documents from a file, from stdin with `--file -` or from `--data`; `meili delete documents --index <index> (--ids <ids> | --filter <filter> | --all) --yes`.
- Indexes: `meili get indexes [--id <index>]`; `meili add indexes --id <index> [--primary-key <field>]`, `meili update indexes --id <index> [--primary-key <field>] [--new-id <index>]`, which renames the index, and `meili delete indexes --id <index> --yes`.
- Tasks: `meili get tasks`, narrowed by `--ids`, `--statuses`, `--types`, `--index-ids`, `--batch-ids`, `--canceled-by` and the date filters of the route, paging with `--limit` and `--from` and following the `next` cursor with `--all`; `meili cancel tasks` and `meili delete tasks --yes`, which take the same filters and answer a task.
- Search: `meili search --index <index> --q <query>`, on `POST /indexes/{index_uid}/search`, with every non-experimental search parameter of the route as a flag, from `--filter` and `--sort` to `--hybrid` and `--vector`; `--data` or `--file` carries a whole search body, which a flag of the same field overrides.
- Cloud projects: `meili get projects [--id <id>]`, which pages with `--page`, `--limit` and `--all` like the Meilisearch lists, `meili add projects --name <name> --team-id <id> --resource-id <id>`, `meili update projects --id <id> --name <name>` and `meili delete projects --id <id> --yes`, the first commands of the Management API, reached with `--management-token` and `--management-url` or with the session of `meili auth login`. Its errors are passed through like Meilisearch's, same shape, same exit codes.
- `meili schema` prints the index of the command tree as JSON, one entry per command with its routes, and `meili schema --command "get indexes"` prints one command in full, with its key actions and whether it returns a task.
- Connection through `--project-url` and `--project-api-key`, or `MEILI_PROJECT_URL` and `MEILI_PROJECT_API_KEY`; `MEILI_MANAGEMENT_TOKEN` and `MEILI_MANAGEMENT_URL` for the Management API.
- Several projects in a config file, `~/.config/meili/config.json` or `MEILI_CONFIG`, chosen with `--project` on the command line and never deduced; `meili config list`, `config set` and `config unset` manage the file.
- A project's `cloudId` in the file gives its id to the management commands, `meili update projects --project prod`; `meili config sync-with-cloud` fills it from Meilisearch Cloud on the entries that have the project's URL, and `meili add projects --add-to-config` adds the project it creates, with the master key creation returns once.
- `meili auth login` logs in to Meilisearch Cloud with a browser, through the OAuth2 authorization code flow with PKCE on a loopback redirect, and stores the session in `credentials.json` next to the config file, mode `600`; the management commands refresh it on their own, `meili auth status` says whether that session is still accepted by the server, `meili auth refresh` rotates it on demand, and `meili auth logout` revokes it and forgets it.
- A command of the verb `delete` requires `--yes` on the command line: without it the command refuses to run, `cli_usage` and exit 2, before any network call. The CLI still never asks a question.
- `json` output by default, `ndjson` for lists, `--all` to follow the pagination, `--wait` and `--timeout` for asynchronous tasks.
- Structured errors on stderr with stable codes and exit codes, a "did you mean" hint on an unknown command, `--debug` HTTP traces with secrets masked.
