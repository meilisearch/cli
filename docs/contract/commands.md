# Command tree

This file is the list of commands `meili` provides. A command that is not in this file does not exist. To add one, change this file first, in its own pull request.

Grammar: `meili [global flags] <resource> <verb> [args] [flags]`. Resource and verb names follow the API. Verbs are `list`, `get`, `create`, `update`, `delete` when the API is a plain CRUD, and the API operation name otherwise.

Every argument in `<angle brackets>` is required. Every argument in `[square brackets]` is optional.

## Global flags

These flags work on every command.

| Flag | Meaning |
|---|---|
| `--context <name>` | Use a named context from the config file. See `config.md`. |
| `--url <url>` | Engine URL. Overrides the context. |
| `--api-key <key>` | Engine API key. Overrides the context. |
| `-o, --output <mode>` | `json`, `ndjson` or `table`. Default: `json` when stdout is not a TTY, `table` when it is. |
| `--json` | Same as `--output json`. |
| `-y, --yes` | Skip the confirmation of destructive commands. Required when stdin is not a TTY. |
| `--debug` | Print every HTTP request and response on stderr, secrets redacted. |
| `--no-color` | Disable colors. Also honored through the `NO_COLOR` environment variable. |

## Shared flag groups

Commands reuse these groups. A command that matches a group uses the whole group, with the same names.

**Write commands** (any command whose API response is a task):

| Flag | Meaning |
|---|---|
| `--wait` | Poll the task until it reaches a final status, then print the final task. |
| `--timeout <duration>` | Maximum wait time, for example `30s`, `2m`. Default `60s`. Only with `--wait`. |

**List commands**:

| Flag | Meaning |
|---|---|
| `--limit <n>` | Passed to the API. |
| `--offset <n>` or `--from <uid>` | Passed to the API. The name is the API parameter name for that route. |
| `--all` | Fetch every page. Streams with `ndjson`, buffers into one array with `json`. |

**Body input** (commands that send a JSON body):

| Flag | Meaning |
|---|---|
| `--file <path>` | Read the body from a file. `-` reads from stdin. |
| `--data <json>` | Inline JSON body. `--file` and `--data` are exclusive. |

## Engine: server

| Command | API route |
|---|---|
| `meili health` | `GET /health` |
| `meili version` | `GET /version` |
| `meili stats` | `GET /stats` |

## Engine: indexes

| Command | API route |
|---|---|
| `meili index list` | `GET /indexes` (list group) |
| `meili index get <index>` | `GET /indexes/{index}` |
| `meili index create <index> [--primary-key <field>]` | `POST /indexes` (write group) |
| `meili index update <index> --primary-key <field>` | `PATCH /indexes/{index}` (write group) |
| `meili index delete <index>` | `DELETE /indexes/{index}` (write group, destructive) |
| `meili index swap <index-a> <index-b>` | `POST /swap-indexes` (write group, destructive) |
| `meili index stats <index>` | `GET /indexes/{index}/stats` |

## Engine: documents

| Command | API route |
|---|---|
| `meili document list <index> [--filter <expr>] [--fields <a,b>]` | `POST /indexes/{index}/documents/fetch` (list group) |
| `meili document get <index> <id> [--fields <a,b>]` | `GET /indexes/{index}/documents/{id}` |
| `meili document add <index> --file <path> [--primary-key <field>] [--batch-size <bytes>]` | `POST /indexes/{index}/documents` (write group). Accepts JSON, NDJSON and CSV, detected from the extension or `--format`. Large files are split into several tasks; `--wait` waits for all of them. |
| `meili document update <index> --file <path> [--primary-key <field>]` | `PUT /indexes/{index}/documents` (write group) |
| `meili document delete <index> <id>` | `DELETE /indexes/{index}/documents/{id}` (write group, destructive) |
| `meili document delete <index> --ids <a,b,c>` | `POST /indexes/{index}/documents/delete-batch` (write group, destructive) |
| `meili document delete <index> --filter <expr>` | `POST /indexes/{index}/documents/delete` (write group, destructive) |
| `meili document delete-all <index>` | `DELETE /indexes/{index}/documents` (write group, destructive) |

`meili document delete` requires exactly one of `<id>`, `--ids`, `--filter`.

## Engine: search

| Command | API route |
|---|---|
| `meili search <index> [query] [--filter <expr>] [--sort <a:asc,b:desc>] [--facets <a,b>] [--limit <n>] [--offset <n>] [--attributes-to-retrieve <a,b>] [--attributes-to-highlight <a,b>] [--show-ranking-score]` | `POST /indexes/{index}/search` |
| `meili search <index> --file <path>` | Same route, the file is the full request body. Use this for parameters that have no flag (hybrid, vector, matching strategy). |
| `meili multi-search --file <path>` | `POST /multi-search` |
| `meili facet-search <index> <facet-name> [--facet-query <q>] [--filter <expr>]` | `POST /indexes/{index}/facet-search` |
| `meili similar <index> <id> [--limit <n>] [--filter <expr>]` | `POST /indexes/{index}/similar` |

Flags on `meili search` cover the common parameters. Any search parameter can also be passed with `--param name=value` (repeatable). `--file` wins over every other flag.

## Engine: settings

| Command | API route |
|---|---|
| `meili settings get <index> [setting]` | `GET /indexes/{index}/settings` or `GET /indexes/{index}/settings/{setting}` |
| `meili settings update <index> [setting] --file <path>` | `PATCH /indexes/{index}/settings` or the sub-resource route (write group). The CLI knows which sub-resources use `PUT` and which use `PATCH`. |
| `meili settings reset <index> [setting]` | `DELETE /indexes/{index}/settings` or the sub-resource route (write group, destructive) |

`[setting]` is a sub-resource name as in the API URL: `searchable-attributes`, `filterable-attributes`, `synonyms`, `embedders`, and so on.

## Engine: tasks and batches

| Command | API route |
|---|---|
| `meili task list [--statuses <a,b>] [--types <a,b>] [--index-uids <a,b>] [--uids <a,b>] [--before-enqueued-at <date>] [--after-enqueued-at <date>] [--from <uid>] [--limit <n>]` | `GET /tasks` (list group). Every filter of the API is a flag with the same name in kebab-case. |
| `meili task get <uid>` | `GET /tasks/{uid}` |
| `meili task wait <uid> [--timeout <duration>]` | Polls `GET /tasks/{uid}` until final status. Exit code 8 if the task failed or was canceled. |
| `meili task cancel --uids <a,b>` and the same filters as `list` | `POST /tasks/cancel` (write group). Requires at least one filter. |
| `meili task delete --uids <a,b>` and the same filters as `list` | `DELETE /tasks` (write group, destructive). Requires at least one filter. |
| `meili batch list` with the same filters as `task list` | `GET /batches` (list group) |
| `meili batch get <uid>` | `GET /batches/{uid}` |

## Engine: keys

| Command | API route |
|---|---|
| `meili key list` | `GET /keys` (list group) |
| `meili key get <key-or-uid>` | `GET /keys/{key}` |
| `meili key create --actions <a,b> --indexes <a,b> [--name <n>] [--description <d>] [--expires-at <date>] [--uid <uuid>]` | `POST /keys` |
| `meili key update <key-or-uid> [--name <n>] [--description <d>]` | `PATCH /keys/{key}` |
| `meili key delete <key-or-uid>` | `DELETE /keys/{key}` (destructive) |

Keys are not tasks. These commands return the key object directly.

## Engine: dumps and snapshots

| Command | API route |
|---|---|
| `meili dump create` | `POST /dumps` (write group) |
| `meili snapshot create` | `POST /snapshots` (write group) |

## Contexts

Contexts are named connections stored in the config file. See `config.md`. These commands do not call any API.

| Command | Effect |
|---|---|
| `meili context list` | List contexts. API keys are masked. |
| `meili context add <name> --url <url> [--api-key <key>]` | Add a context. Fails if the name exists, unless `--force`. |
| `meili context use <name>` | Set the default context. |
| `meili context current` | Print the resolved connection for this invocation, API key masked. Useful to debug precedence. |
| `meili context remove <name>` | Remove a context (destructive). |

## Management API (Meilisearch Cloud)

Commands that manage Meilisearch Cloud live under the `management` topic and call the management API. The OpenAPI spec is committed at `openapi/management.yaml` and is the reference for every name below. The base URL is `https://api.meilisearch.com`, every path starts with `/api/v2`.

Authentication: a personal access token (PAT), sent as a Bearer token. See `config.md`.

Resource hierarchy: organization, then team, then project. A project runs on a resource (a plan and a size) in a region. Names and flags follow the API: a snake_case parameter becomes a kebab-case flag (`team_id` becomes `--team-id`). Responses pass through in snake_case, as the API returns them.

| Command | API route |
|---|---|
| `meili management login --token <pat>` | No write route. Validates the token with `GET /api/v2/me`, then stores it in the config file. `--token -` reads the token from stdin. Never prompts. |
| `meili management logout` | Removes the stored token. No API call. |
| `meili management whoami` | `GET /api/v2/me` |
| `meili management organization list` | `GET /api/v2/organizations` |
| `meili management organization get <id>` | `GET /api/v2/organizations/{id}` |
| `meili management organization update <id> --name <name>` | `PATCH /api/v2/organizations/{id}` |
| `meili management team list` | `GET /api/v2/teams` |
| `meili management team get <id>` | `GET /api/v2/teams/{id}` |
| `meili management team create --name <name> --organization-id <id>` | `POST /api/v2/teams` |
| `meili management team update <id> [--name <name>] [--owner-id <uuid>]` | `PATCH /api/v2/teams/{id}` |
| `meili management team-member list --team-id <id>` | `GET /api/v2/team_members` |
| `meili management team-member invite --team-id <id> --email <email>` | `POST /api/v2/team_members` |
| `meili management team-member remove --team-id <id> --email <email>` | `DELETE /api/v2/team_members` (destructive) |
| `meili management project list [--team-id <id>]` | `GET /api/v2/projects` |
| `meili management project get <id>` | `GET /api/v2/projects/{id}` |
| `meili management project create --name <name> --team-id <id> --resource-id <id>` | `POST /api/v2/projects`. Returns the project with its `status`. Waiting for provisioning is not in the contract until the `status` values are documented in the spec. |
| `meili management project update <id> --name <name>` | `PATCH /api/v2/projects/{id}` |
| `meili management project delete <id>` | `DELETE /api/v2/projects/{id}` (destructive). The API returns 204: nothing on stdout, exit 0. |
| `meili management region list` | `GET /api/v2/regions` |
| `meili management resource list [--region-id <id>]` | `GET /api/v2/resources` |
| `meili management meilisearch-version list` | `GET /api/v2/meilisearch_versions` |

Identifiers: the API uses integer ids. Commands take the integer `id`. Resolving a project by name or by `project_uid` is not in the contract.

Not in the API today, so not in the CLI: billing and invoices, project API key management, pause and resume, version upgrade. Add them here when the API exposes them, in the same pull request as the spec update.

`meili --project <id> <engine command>`: run an engine command against a Meilisearch Cloud project without copying its URL and key. The CLI calls `GET /api/v2/projects/{id}`, reads `url` and `apikey`, and continues as a normal engine command. This global flag is part of the management API milestone, not of the first release.

## Self-description and tooling

| Command | Effect |
|---|---|
| `meili schema` | Print the full command tree as JSON: commands, arguments, flags, descriptions, examples. Generated from the oclif manifest. This is how an agent learns the CLI in one call. |
| `meili docs` | Print the agent guide (a compact Markdown text that explains conventions, output, errors and the most useful commands). |
| `meili completions <shell>` | Print shell completions for `bash`, `zsh`, `fish`. |
| `meili mcp serve` | Expose the commands as MCP tools over stdio. Later milestone, after the command tree is stable. |
| `meili --version` | CLI version only. No network call. |

## Not in scope

`meili` is for coding agents only. Human comfort features are not planned: interactive modes and TUIs, `$EDITOR` integration, prompts, wizards. Also not planned: starting a local Meilisearch, self-update, chat. Open a contract pull request if you think one of them belongs here.

## Milestones

1. Server, indexes, documents, search, settings, tasks, keys, contexts, `schema`, `docs`, `completions`. Release 1.0.
2. Management API. Release 1.x.
3. `mcp serve`. Release 1.x.
