# Command contract

`meili` mirrors the two APIs it talks to. A command exists for the routes of the Meilisearch API or of the Management API as soon as someone implements it, and its name and flags derive from those routes by the rules of this file. There is no list of commands to update first: the OpenAPI documents are the reference, `oclif.manifest.json` and `meili schema` are the list, `pnpm api:coverage` shows what remains.

Grammar: `meili [global flags] <verb> <resources> [flags]`, for example `meili get indexes --id movies` or `meili delete documents --index movies --ids 1,2`. The verb comes first, the resource is plural, and every value travels in a named flag: there is no positional argument, so a command reads without knowing the order of its parameters. One command covers every route that shares its verb and its resource, and the flags given choose the route.

## The OpenAPI documents

| API | Document | Access |
|---|---|---|
| Meilisearch API | `meilisearch-openapi.json`, an asset of every Meilisearch release: `https://github.com/meilisearch/meilisearch/releases/download/<tag>/meilisearch-openapi.json` | public |
| Management API | `api/swagger/v2/swagger.yaml` on the `main` branch of the `meilisearch/meilisearch-cloud` repository | private: `gh auth login` on a workstation, the `MEILI_BOT_GH_PAT` secret in CI |

`pnpm openapi` downloads both into `openapi/`, as `meilisearch.json` and `management.json`, never committed. `pnpm openapi:meilisearch` takes the latest release, or the one named by `MEILISEARCH_VERSION`. The contract tests read these files and fail when they are missing: no command is checked, or written, without the document that describes its routes. CI downloads them before the tests.

When the document does not describe what a command needs (the route, a parameter, a response field), stop and ask the maintainers. Do not guess, and do not read the answer in Meilisearch's source code: the document is the contract, and fixing it upstream is the fix.

## Naming rules

Every API command declares its routes, `static routes = ["GET /indexes", "GET /indexes/{index_uid}"]`, written as in the document. The rules below turn routes into a command name and its flags. `src/lib/api-naming.ts` implements them, `test/contract/api.test.ts` enforces them.

1. **Verb.** The HTTP method gives it: `GET` is `get`, `POST` is `create`, `PUT` and `PATCH` are `update`, `DELETE` is `delete`. A trailing literal segment that is an action replaces it: `POST /tasks/cancel` gives `cancel`, `POST /indexes/{index_uid}/compact` gives `compact`, `POST /indexes/{index_uid}/documents/delete` gives `delete`. The literal verbs are a closed list: `delete`, `cancel`, `compact`, `swap`, `search`, `similar`, `facet-search`, `multi-search`, `export`. Adding one is a contract change.
2. **Resource.** The last literal segment of the path that names a resource, plural, in kebab-case of the API name, without the `/api/v2` prefix of the Management API: `indexes`, `documents`, `team-members`, `stats`, `health`. A singleton keeps its name: `get health`, `get version`, `get stats`. Five commands have no resource word, because they are the most typed: `search`, `similar`, `facet-search`, `multi-search`, `export`. They are listed in the exceptions.
3. **Several routes, one command.** Every route with the same verb and resource belongs to one command: `GET /indexes` and `GET /indexes/{index_uid}` are `get indexes`, `GET /stats` and `GET /indexes/{index_uid}/stats` are `get stats`, the three deletion routes of documents are `delete documents`. The flags choose the route: first the route whose path parameters are exactly the identifier flags given, then the route whose parameters cover the other flags given. Two flags that call for different routes, `--ids` and `--filter` on `delete documents` for example, are a usage error, `cli_usage`, exit 2, before any network call. A flag that belongs to the list route only, `--limit` or `--offset`, is ignored and not sent when `--id` selects the unit route.
4. **Identifiers.** The path parameter of the resource itself is `--id` when the unit route is implemented: `get indexes --id movies`, `delete keys --id <uid>`, `get projects --id 343`. When the list route can filter by identifiers, the unit route is not implemented and the list takes `--ids`, with `--id` accepted as an alias: `get documents --index movies --ids 42` calls the fetch route, `get tasks --ids 42` filters `GET /tasks`, `get batches --ids 7` filters `GET /batches`. The path parameter of a parent resource is a flag named after that collection, singular: `--index movies`. The verb-only commands take the index the same way: `search --index movies`. On the Management API, a parent parameter keeps its API name in kebab-case, `{projectId}` is `--project-id`, because `--project` is the global flag that names an entry of the config file; and that entry can supply the project: `--id` of the `projects` commands and `--project-id` of their sub-resources are optional, `--project <name>` fills them with the entry's `cloudId` (`config.md`, "Cloud projects").
5. **Identifiers are named by what they identify.** A query or body parameter that carries identifiers, `uid`, `uids`, `batchUids`, `indexUids`, is named after the resource it identifies: the command's own resource gives `--id` or `--ids`, another resource gives `--<resource>-ids`. So `create indexes --id movies` and `create keys --id <uuid>` carry `uid`; `get tasks --ids 1,2 --batch-ids 7 --index-ids movies` carries `uids`, `batchUids` and `indexUids`; `get batches --ids 7 --task-ids 1,2` carries `batchUids` and `uids`, because bare `uids` are task identifiers everywhere. The API spellings, `--uid`, `--uids`, `--batch-uids`, `--index-uids`, are accepted as aliases, absent from `--help` and `meili schema`. One exception: on `update indexes`, `--id` is the index itself, so the new `uid` is `--new-id`, alias `--uid`. Every other body field keeps its API name, `--primary-key`, `--name`.
6. **Other flags.** The query parameters and the first-level fields of the JSON body, in kebab-case of the API name: `retrieveVectors` is `--retrieve-vectors`, `teamId` is `--team-id`, `primaryKey` is `--primary-key`. When a body has a single object property named after the resource, `{"project": {"name": …}}` in the Management API, the fields of that object are the flags. The only flags that do not come from a route are the global flags and the CLI-owned flags: `--wait`, `--timeout`, `--all`, `--file`, `--data`, `--add-to-config`.
7. **Values.** A scalar is passed as it is. A boolean is a bare flag, `--retrieve-vectors`. An array of scalars is comma-separated, `--fields id,title`, as the API's own GET syntax. An object or a nested array is JSON text, `--typo-tolerance '{"enabled":false}'`. The value `null` sends a JSON null, `--expires-at null`, `--stop-words null`.
8. **Body input.** On every route with a body, `--file <path>` or `--data '<json>'` replaces the body fields; `--file -` reads stdin. Path and query flags stay valid next to them. A body-field flag given together with `--file` or `--data` overrides that field, as a flag overrides its environment variable. When the body is wrapped, `{"project": {…}}`, `--file` and `--data` give the wrapped object, as the flags do. Documents are sent as JSON, the only content type the document declares.
9. **Routes that are not implemented.** The `GET` twin of a `POST` route that takes the same parameters in a body (search, similar, the list of documents); the unit route of a resource whose list filters by identifiers (documents, tasks, batches); the settings sub-routes, since `update settings` sends any subset and `null` resets one setting; `GET /api/v2/meilisearch-versions`. Each is recorded without command in the exceptions.
10. **Experimental routes** are out of the contract until the feature is stable. Implementing one is a contract change: an exception row with the reason. `compact` is the one exception today.
11. **Destructive commands**, `delete`, `cancel` and `swap`, run as written. There is no confirmation flag and never a question, see `output.md`.

| Routes | Command |
|---|---|
| `GET /health` | `meili get health` |
| `GET /stats`, `GET /indexes/{index_uid}/stats` | `meili get stats [--index <index>]` |
| `GET /indexes`, `GET /indexes/{index_uid}` | `meili get indexes [--id <index>]` |
| `POST /indexes` | `meili create indexes --id <index> [--primary-key <field>]` |
| `PATCH /indexes/{index_uid}` | `meili update indexes --id <index> [--primary-key <field>] [--new-id <index>]` |
| `DELETE /indexes/{index_uid}` | `meili delete indexes --id <index>` |
| `POST /indexes/{index_uid}/compact` | `meili compact indexes --id <index>` |
| `POST /swap-indexes` | `meili swap indexes --indexes <a>,<b>` |
| `POST /indexes/{index_uid}/documents/fetch` | `meili get documents --index <index> [--ids <ids>] [--filter <filter>]` |
| `POST /indexes/{index_uid}/documents` | `meili create documents --index <index> --file <path>` |
| `POST …/documents/delete-batch`, `POST …/documents/delete`, `DELETE …/documents` | `meili delete documents --index <index> (--ids <ids> \| --filter <filter> \| --all)` |
| `POST /indexes/{index_uid}/search` | `meili search --index <index> --q <query>` |
| `PATCH /indexes/{index_uid}/settings` | `meili update settings --index <index> --<setting> <value>` |
| `GET /tasks` | `meili get tasks [--ids <uids>] [--statuses <statuses>]` |
| `POST /tasks/cancel` | `meili cancel tasks --ids <uids>` |
| `GET /keys`, `GET /keys/{key}` | `meili get keys [--id <uid>]` |
| `POST /dumps` | `meili create dumps` |
| `GET /api/v2/projects`, `GET /api/v2/projects/{id}` | `meili get projects [--id <id>] [--team-id <id>]` |
| `POST /api/v2/projects` | `meili create projects --name <name> --team-id <id> --resource-id <id> [--ms-version <version>] [--add-to-config]` |
| `PATCH /api/v2/projects/{id}` | `meili update projects (--id <id> \| --project <name>) --name <name>` |
| `DELETE /api/v2/projects/{id}` | `meili delete projects (--id <id> \| --project <name>)` |
| `GET /api/v2/team-members` | `meili get team-members --team-id <id>` |

## Exceptions

A route whose derived name is wrong, ambiguous or collides with another one gets an explicit exception, recorded in `ROUTE_EXCEPTIONS` of `src/lib/api-naming.ts` and in the table below, with a reason. A route can also be declared without command, `none`: a `GET` twin covered by its `POST`, a unit route covered by its list, an experimental route, a route the CLI will never expose. `*` as the method matches every method, and a path ending with `/*` matches every route under that prefix, not the prefix itself; the first matching row wins. The command column names the command, then the flags that distinguish the route, which the route accepts: `delete documents --ids` makes `--ids` a flag of the delete-batch route. The exception ships in the pull request of the command, and the contract test checks that the two lists match. Anything the rules and the exceptions do not describe is a contract change.

| Route | Command | Reason |
|---|---|---|
| `GET /indexes/{index_uid}/search` | none | Twin of the POST route, which takes the same parameters in a body. The CLI implements POST. |
| `POST /indexes/{index_uid}/search` | `search --index` | Verb only, the most typed command. |
| `GET /indexes/{index_uid}/similar` | none | Twin of the POST route. The CLI implements POST. |
| `POST /indexes/{index_uid}/similar` | `similar --index` | Verb only, like `search`. `--id` is the API field: the document to compare with. |
| `POST /indexes/{index_uid}/facet-search` | `facet-search --index` | Verb only, like `search`. |
| `POST /multi-search` | `multi-search` | Verb only, like `search`. No index: the queries name theirs. |
| `POST /export` | `export` | Verb only: the route has no resource. |
| `POST /swap-indexes` | `swap indexes --indexes` | The literal holds the verb and the resource. `--indexes a,b` swaps one pair; several pairs go through `--data` or `--file`. |
| `GET /indexes/{index_uid}/documents` | none | Covered by `get documents`, which uses the fetch route and its body. |
| `POST /indexes/{index_uid}/documents/fetch` | `get documents --index` | A POST that lists: filters, fields and pagination travel in its body. `--id` is an alias of `--ids`. |
| `GET /indexes/{index_uid}/documents/{document_id}` | none | Covered by `get documents --ids`. |
| `DELETE /indexes/{index_uid}/documents/{document_id}` | none | Covered by `delete documents --ids`. |
| `POST /indexes/{index_uid}/documents/delete-batch` | `delete documents --ids` | The body is an array of identifiers without a name; `--ids` is the name of the fetch route. |
| `POST /indexes/{index_uid}/fields` | `get fields --index` | A POST that lists. |
| `* /indexes/{index_uid}/settings/*` | none | `update settings` sends any subset of the settings; `null` resets one of them. |
| `GET /tasks/{task_id}` | none | Covered by `get tasks --ids`, which filters `uids`. |
| `GET /batches/{batch_id}` | none | Covered by `get batches --ids`. |
| `POST /tasks/compact` | `compact tasks` | Experimental (`taskQueueCompactionRoute`), kept on purpose. |
| `GET /api/v2/meilisearch-versions` | none | Not needed for now. |
| `* /chats` | none | Experimental (`chatCompletions`). Out of the contract until stable. |
| `* /chats/*` | none | Experimental (`chatCompletions`). |
| `GET /metrics` | none | Experimental (`metrics`). |
| `* /logs/*` | none | Experimental (`logsRoute`). |
| `POST /render-template` | none | Experimental (`renderRoute`). |
| `POST /indexes/{index_uid}/documents/edit` | none | Experimental (`editDocumentsByFunction`). |
| `* /dynamic-search-rules` | none | Experimental (`dynamicSearchRules`). |
| `* /dynamic-search-rules/*` | none | Experimental (`dynamicSearchRules`). |
| `* /network` | none | Experimental (`network`). |
| `* /network/*` | none | Experimental (`network`). |
| `GET /tasks/stream` | none | Experimental (`tasksStreamingRoute`). The CLI may use it internally for `--wait`, see issue #1. |
| `GET /batches/stream` | none | Experimental (`tasksStreamingRoute`). |
| `GET /tasks/{task_id}/documents` | none | Experimental (`getTaskDocumentsRoute`). |
| `* /experimental-features` | none | Toggles experimental features; the CLI does not expose it for now. |
| `POST /mcp` | none | Meilisearch serves its own MCP endpoint; the CLI does not proxy it. The name `mcp` stays reserved for this route: a CLI-side MCP server, if ever built, takes another name. |

## Global flags

These flags work on every command.

| Flag | Meaning |
|---|---|
| `--project-url <url>` | Project URL, the Meilisearch instance to talk to. |
| `--project-api-key <key>` | Project API key. `-` reads it from stdin. |
| `--project <name>` | A project of the config file: its URL and key for a Meilisearch command, its `cloudId` for a management command. Cannot be combined with `--project-url`, nor with `--id`. Required when the file has several projects. See `config.md`. |
| `--management-token <pat>` | Management API personal access token. |
| `--management-url <url>` | Management API base URL. Default `https://api.meilisearch.com`. |
| `-o, --output <mode>` | `json` (default) or `ndjson`. See `output.md`. |
| `--debug` | Print every HTTP request and response on stderr, secrets redacted. |

## Shared flag groups

Commands reuse these groups. A command that matches a group uses the whole group, with the same names.

**Write commands** (any command whose API response is a task):

| Flag | Meaning |
|---|---|
| `--wait` | Poll the task until it reaches a final status, then print the final task. |
| `--timeout <duration>` | Maximum wait time, for example `30s`, `2m`. Default `60s`. Only with `--wait`. |

**List routes** (a `get` without `--id`, or `get documents`):

| Flag | Meaning |
|---|---|
| `--limit <n>` | Passed to the API. |
| `--offset <n>` or `--from <uid>` | Passed to the API. The name is the API parameter name for that route. |
| `--all` | Fetch every page. Streams with `ndjson`, buffers into one array with `json`. On `delete documents`, selects the route that deletes every document. |

**Body input** (commands that send a JSON body):

| Flag | Meaning |
|---|---|
| `--file <path>` | Read the body from a file. `-` reads from stdin. |
| `--data <json>` | Inline JSON body. `--file` and `--data` are exclusive. |

**Config file** (`create projects`):

| Flag | Meaning |
|---|---|
| `--add-to-config` | Add the created project to the config file, as an entry named after it with its URL, its master key and its `cloudId`. See `config.md`. |

## Commands that do not derive from a route

These commands are the only ones listed here; their `--help` defines their shape. Their name is never the name of an API resource. The `config` commands are for humans: an agent works with the file it was given, see `config.md`. `config sync-with-cloud` is the one that calls an API, the Management API, with `static api = "management"` and no route.

| Command | Effect |
|---|---|
| `meili schema` | Print the full command tree as JSON: commands, flags, descriptions, examples. Generated from the oclif manifest. This is how an agent learns the CLI in one call. |
| `meili config list` | Print the config file path and its projects as JSON, keys masked. |
| `meili config add --project <name> --project-url <url> [--project-api-key <key>] [--project-cloud-id <id>]` | Add a project to the config file, creating it in mode `600`. `--project-api-key -` reads the key from stdin. Refuses a URL that is not HTTP(S) with `cli_usage`, and a name that already exists with `cli_config`. Nothing on stdout. |
| `meili config update --project <name> [--project-url <url>] [--project-api-key <key>] [--project-cloud-id <id>]` | Change the fields given of a project of the config file. At least one, or `cli_usage`. Nothing on stdout. |
| `meili config remove --project <name>` | Remove a project from the config file. Nothing on stdout. |
| `meili config sync-with-cloud [--team-id <id>]` | List the Meilisearch Cloud projects the token sees and set `cloudId` on the config file entries that have a project's URL. Never writes a key, never adds or removes an entry. Prints `{"updated", "unchanged", "missing"}`, lists of entry names; `missing` is empty with `--team-id`. See `config.md`. |
| `meili --version` | CLI version only. No network call. |

## Not in scope

`meili` is for coding agents only. Human comfort features are not planned: interactive modes and TUIs, `$EDITOR` integration, prompts, confirmations, wizards, shell completions, positional arguments. Also not planned: starting a local Meilisearch, self-update, chat, a guide command, dry runs, splitting a large documents file into batches, running a Meilisearch API command against a Cloud project by its id, NDJSON or CSV documents as long as the OpenAPI document does not declare them. Open a contract pull request if you think one of them belongs here.

## Milestones

1. The Meilisearch API: every stable route of `meilisearch-openapi.json`, plus `schema`. Release 1.0.
2. The Management API. Release 1.x.
