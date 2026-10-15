---
"@meilisearch/cli": minor
---

First version of `meili`, the Meilisearch CLI built for coding agents.

- Commands derive from the routes of the Meilisearch API and of the Management API, verb first and resource plural: `meili get health`, `meili get indexes`, `meili get indexes --id movies`.
- `meili create projects`, `meili update projects` and `meili delete projects` manage Meilisearch Cloud projects through the Management API, with `--management-token` and `--management-url`.
- Write commands take their body from flags, `--data '<json>'` or `--file <path>` (`-` for stdin), a flag overriding its field; `null` sends a JSON null.
- `meili schema` prints every command with its flags and examples as JSON.
- Connection through `--project-url` and `--project-api-key`, or `MEILI_PROJECT_URL` and `MEILI_PROJECT_API_KEY`; `MEILI_MANAGEMENT_TOKEN` and `MEILI_MANAGEMENT_URL` for the Management API.
- Several projects in a config file, `~/.config/meili/config.json` or `MEILI_CONFIG`, chosen with `--project` on the command line and never deduced; `meili config list`, `config add`, `config update` and `config remove` manage the file.
- A project's `cloudId` in the file gives its id to the management commands, `meili update projects --project prod`; `meili config sync-with-cloud` fills it from Meilisearch Cloud and adds the missing projects, `meili create projects --add-to-config` adds the project it creates.
- `json` output by default, `ndjson` for lists, `--all` to follow the pagination, `--wait` and `--timeout` for asynchronous tasks.
- Structured errors on stderr with stable codes and exit codes, a "did you mean" hint on an unknown command, `--debug` HTTP traces with secrets masked.
