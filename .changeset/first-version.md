---
"@meilisearch/cli": minor
---

First version of `meili`, the Meilisearch CLI built for coding agents.

- Commands derive from the routes of the Meilisearch API and of the Management API, verb first and resource plural: `meili get health`, `meili get indexes`, `meili get indexes --id movies`.
- `meili schema` prints every command with its flags and examples as JSON.
- Connection through `--project-url` and `--project-api-key`, or `MEILI_PROJECT_URL` and `MEILI_PROJECT_API_KEY`; `MEILI_MANAGEMENT_TOKEN` and `MEILI_MANAGEMENT_URL` for the Management API.
- `json` output by default, `ndjson` for lists, `--all` to follow the pagination, `--wait` and `--timeout` for asynchronous tasks.
- Structured errors on stderr with stable codes and exit codes, a "did you mean" hint on an unknown command, `--debug` HTTP traces with secrets masked.
