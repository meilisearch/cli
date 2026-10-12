---
"@meilisearch/cli": minor
---

First version of `meili`, the Meilisearch CLI built for coding agents.

- Structure: commands derive from the routes of the Meilisearch API and of the Management API, verb first and resource plural (`meili get indexes --id movies`); one file per command, and contract tests that keep the code and `docs/contract/` in sync.
- Commands: `get health`, `get indexes`, `schema`.
- Connection: `--project-url` and `--project-api-key`, or `MEILI_PROJECT_URL` and `MEILI_PROJECT_API_KEY`; `MEILI_MANAGEMENT_TOKEN` and `MEILI_MANAGEMENT_URL` for the Management API.
- Output: `json` by default, `ndjson` for lists, `--all` to follow the pagination, `--wait` and `--timeout` for asynchronous tasks.
- Errors: structured JSON on stderr with stable codes and exit codes, a "did you mean" hint on an unknown command, `--debug` HTTP traces with secrets masked.
