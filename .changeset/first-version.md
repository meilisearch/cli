---
"@meilisearch/cli": minor
---

First version of `meili`, the Meilisearch CLI built for coding agents.

- Commands derive from the routes of the Meilisearch API and of the Management API, verb first and resource plural: `meili get health`, `meili get indexes`, `meili get indexes --id movies`.
- Documents: `meili get documents --index <index>`, narrowed by `--ids` or `--filter`; `meili create documents --index <index> --file <path>` and `meili update documents --index <index> --file <path>`, which read the documents from a file, from stdin with `--file -` or from `--data`; `meili delete documents --index <index> (--ids <ids> | --filter <filter> | --all) --yes`.
- `meili schema` prints the index of the command tree as JSON, one entry per command with its routes, and `meili schema --command "get indexes"` prints one command in full, with its key actions and whether it returns a task.
- Connection through `--project-url` and `--project-api-key`, or `MEILI_PROJECT_URL` and `MEILI_PROJECT_API_KEY`; `MEILI_MANAGEMENT_TOKEN` and `MEILI_MANAGEMENT_URL` for the Management API.
- Several projects in a config file, `~/.config/meili/config.json` or `MEILI_CONFIG`, chosen with `--project` on the command line and never deduced; `meili config list`, `config add` and `config remove` manage the file.
- `meili auth login` logs in to Meilisearch Cloud with a browser, through the OAuth2 authorization code flow with PKCE on a loopback redirect, and stores the session in `credentials.json` next to the config file, mode `600`; the management commands refresh it on their own, `meili auth status` says whether that session is still accepted by the server, `meili auth refresh` rotates it on demand, and `meili auth logout` revokes it and forgets it.
- A command of the verb `delete` requires `--yes` on the command line: without it the command refuses to run, `cli_usage` and exit 2, before any network call. The CLI still never asks a question.
- `json` output by default, `ndjson` for lists, `--all` to follow the pagination, `--wait` and `--timeout` for asynchronous tasks.
- Structured errors on stderr with stable codes and exit codes, a "did you mean" hint on an unknown command, `--debug` HTTP traces with secrets masked.
