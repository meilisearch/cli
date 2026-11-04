# Command contract

`meili` mirrors the two APIs it talks to. A command exists for the routes of the Meilisearch API or of the Management API as soon as someone implements it. Its name and flags derive from those routes by the rules of this file. There is no list of commands to update first. The OpenAPI documents are the reference, `oclif.manifest.json` and `meili schema` are the list, and `pnpm api:coverage` shows what remains.

Grammar: `meili [global flags] <verb> <resources> [flags]`, for example `meili get indexes --id movies` or `meili delete documents --index movies --ids 1,2`. The verb comes first and the resource is plural. Every value goes in a named flag. There is no positional argument, so you can read a command without knowing the order of its parameters. One command covers every route that has the same verb and the same resource. The flags given choose the route.

## The OpenAPI documents

| API | Document | Access |
|---|---|---|
| Meilisearch API | `meilisearch-openapi.json`, an asset of every Meilisearch release: `https://github.com/meilisearch/meilisearch/releases/download/<tag>/meilisearch-openapi.json` | public |
| Management API | `api/swagger/v2/swagger.yaml` on the `main` branch of the `meilisearch/meilisearch-cloud` repository | private: `gh auth login` on a workstation, the `MEILI_BOT_GH_PAT` secret in CI |

`pnpm openapi` downloads both into `openapi/`, as `meilisearch.json` and `management.json`. They are never committed. `pnpm openapi:meilisearch` takes the latest release, or the release named by `MEILISEARCH_VERSION`. The contract tests read these files and fail when they are missing: no command is checked or written without the document that describes its routes. CI downloads them before the tests.

When the document does not describe what a command needs (the route, a parameter, a response field), stop and ask the maintainers. Do not guess. Do not look for the answer in the Meilisearch source code. The document is the contract, and the fix is to correct the document upstream.

## Naming rules

Every API command declares its routes, `static routes = ["GET /indexes", "GET /indexes/{index_uid}"]`, written as in the document. It also declares the key actions those routes require, `static keyActions = ["indexes.get"]`: the specific action of each `security` entry of the document, empty when the routes need none. `meili schema --command` prints both, and `test/contract/api.test.ts` checks both against the document. The rules below turn routes into a command name and its flags. `src/lib/api-naming.ts` implements them, and `test/contract/api.test.ts` enforces them.

1. **Verb.** The HTTP method gives the verb: `GET` is `get`, `POST` is `add`, `PUT` and `PATCH` are `update`, `DELETE` is `delete`. When the last segment of the path is a literal that names an action, this action replaces the verb: `POST /tasks/cancel` gives `cancel`, `POST /indexes/{index_uid}/compact` gives `compact`, `POST /indexes/{index_uid}/documents/delete` gives `delete`. The literal verbs are a closed list: `delete`, `cancel`, `compact`, `swap`, `search`, `similar`, `facet-search`, `multi-search`, `export`. Adding one is a contract change.
2. **Resource.** The resource is the last literal segment of the path that names a resource. It is plural, in kebab-case of the API name, without the `/api/v2` prefix of the Management API: `indexes`, `documents`, `team-members`, `stats`, `health`. A singleton keeps its name: `get health`, `get version`, `get stats`. Five commands have no resource word, because people type them the most: `search`, `similar`, `facet-search`, `multi-search`, `export`. The exceptions list them.
3. **Several routes, one command.** Every route with the same verb and resource belongs to one command: `GET /indexes` and `GET /indexes/{index_uid}` are `get indexes`, `GET /stats` and `GET /indexes/{index_uid}/stats` are `get stats`, the three deletion routes of documents are `delete documents`. The flags choose the route: first the route whose path parameters are exactly the identifier flags given, then the route whose parameters cover the other flags given. Two flags that call for different routes are a usage error, `cli_usage`, exit 2, before any network call. For example, `--ids` and `--filter` on `delete documents`. A flag that only the list route takes, for example `--limit` or `--offset`, is ignored and not sent when `--id` selects the unit route.
4. **Identifiers.** The path parameter of the resource itself is `--id` when the unit route is implemented: `get indexes --id movies`, `delete keys --id <uid>`, `get projects --id 343`. When the list route can filter by identifiers, the unit route is not implemented. The list then takes `--ids`, and accepts `--id` as an alias: `get documents --index movies --ids 42` calls the fetch route, `get tasks --ids 42` filters `GET /tasks`, `get batches --ids 7` filters `GET /batches`. The path parameter of a parent resource is a flag named after that collection, in the singular: `--index movies`. This flag is required when every route of the command takes it, and optional when one of the routes does not. For example, `--index` is required on `get settings`, and optional on `get stats`, whose other route is `GET /stats`. The verb-only commands take the index the same way: `search --index movies`. On the Management API, a parent parameter keeps its API name in kebab-case: `{projectId}` is `--project-id`. The reason is that `--project` names an entry of the config file, and the `cloud.id` of this entry can replace `--id` or `--project-id` (`config.md`, "Cloud projects").
5. **Identifiers are named by what they identify.** A query or body parameter that carries identifiers, `uid`, `uids`, `batchUids`, `indexUids`, is named after the resource it identifies. The command's own resource gives `--id` or `--ids`. Another resource gives `--<resource>-ids`. So `add indexes --id movies` and `add keys --id <uuid>` carry `uid`. `get tasks --ids 1,2 --batch-ids 7 --index-ids movies` carries `uids`, `batchUids` and `indexUids`. `get batches --ids 7 --task-ids 1,2` carries `batchUids` and `uids`, because bare `uids` are always task identifiers. The API spellings, `--uid`, `--uids`, `--batch-uids`, `--index-uids`, are accepted as aliases. They do not appear in `--help` or `meili schema`. One exception: on `update indexes`, `--id` is the index itself, so the new `uid` is `--new-id`, with the alias `--uid`. Every other body field keeps its API name: `--primary-key`, `--name`.
6. **Other flags.** The query parameters and the first-level fields of the JSON body are flags, in kebab-case of the API name: `retrieveVectors` is `--retrieve-vectors`, `teamId` is `--team-id`, `primaryKey` is `--primary-key`. Only the global flags and the CLI-owned flags do not come from a route: `--wait`, `--timeout`, `--all`, `--file`, `--data`, `--yes`, `--sync-config`, `--sync-with-cloud`, `--project-destination`.
7. **Values.** A scalar is passed as it is. A boolean is a bare flag, `--retrieve-vectors`. The exception is a route that also reads `false` from the value, as the settings do. There the flag takes a value, `--facet-search false`, because a bare flag says neither `false` nor `null`. An array of scalars is comma-separated, `--fields id,title`, like the API's own GET syntax. An object or a nested array is JSON text: `--typo-tolerance '{"enabled":false}'`. The value `null` sends a JSON null: `--expires-at null`, `--stop-words null`.
8. **Body input.** On every route with a body, `--file <path>` or `--data '<json>'` replaces the body fields. `--file -` reads stdin. Path and query flags stay valid next to them. A body-field flag given together with `--file` or `--data` overrides that field, as a flag overrides its environment variable. On some routes, the body is not an object of named fields but the value itself: the array of identifiers of `delete documents --ids`, or the documents of `add documents`. There the body is that value, and its shape selects the route among the routes of the command: `delete documents --data '[1,2]'` deletes by identifiers, `--data '{"filter":…}'` deletes by filter. Documents are sent as JSON, the only content type the document declares.
9. **Routes that are not implemented.** These routes are not implemented: the `GET` twin of a `POST` route that takes the same parameters in a body (search, similar, the list of documents); the unit route of a resource whose list filters by identifiers (documents, tasks, batches); the settings sub-routes, because `update settings` sends any subset and `null` resets one setting; `GET /api/v2/meilisearch-versions`. Each one is recorded in the exceptions, without a command.
10. **Experimental routes** are out of the contract until the feature is stable. Implementing one is a contract change: it needs an exception row with the reason. `compact` is the one exception today. A body field or a query parameter that an experimental feature gates is also out of the contract. The command declares no flag for it, and `--data` or `--file` still sends it to the API. These fields are `useNetwork` on `get documents`; `media`, `personalize`, `useNetwork` and `inlineRule` on `search`; and `media` and `useNetwork` on `facet-search`. They are not in the exceptions table, which lists routes.
11. **Destructive commands.** A command of the verb `delete` takes `--yes` and refuses to run without it: `cli_usage`, exit 2, before any network call. `--yes` is a flag that you write. It is never a question the CLI asks. See `output.md`.

| Routes | Command |
|---|---|
| `GET /health` | `meili get health` |
| `GET /version` | `meili get version` |
| `GET /stats`, `GET /indexes/{index_uid}/stats` | `meili get stats [--index <index>]` |
| `GET /indexes`, `GET /indexes/{index_uid}` | `meili get indexes [--id <index>]` |
| `POST /indexes` | `meili add indexes --id <index> [--primary-key <field>]` |
| `PATCH /indexes/{index_uid}` | `meili update indexes --id <index> [--primary-key <field>] [--new-id <index>]` |
| `DELETE /indexes/{index_uid}` | `meili delete indexes --id <index> --yes` |
| `POST /indexes/{index_uid}/compact` | `meili compact indexes --id <index>` |
| `POST /swap-indexes` | `meili swap indexes --indexes <a>,<b>` |
| `POST /indexes/{index_uid}/documents/fetch` | `meili get documents --index <index> [--ids <ids>] [--filter <filter>]` |
| `POST /indexes/{index_uid}/documents` | `meili add documents --index <index> --file <path>` |
| `PUT /indexes/{index_uid}/documents` | `meili update documents --index <index> --file <path>` |
| `POST …/documents/delete-batch`, `POST …/documents/delete`, `DELETE …/documents` | `meili delete documents --index <index> (--ids <ids> \| --filter <filter> \| --all) --yes` |
| `POST /indexes/{index_uid}/search` | `meili search --index <index> --q <query>` |
| `POST /indexes/{index_uid}/similar` | `meili similar --index <index> --id <document> --embedder <embedder>` |
| `POST /indexes/{index_uid}/facet-search` | `meili facet-search --index <index> --facet-name <attribute>` |
| `POST /multi-search` | `meili multi-search --queries <json> [--federation <json>]` |
| `GET /indexes/{index_uid}/settings` | `meili get settings --index <index>` |
| `PATCH /indexes/{index_uid}/settings` | `meili update settings --index <index> --<setting> <value>` |
| `DELETE /indexes/{index_uid}/settings` | `meili delete settings --index <index> --yes` |
| `GET /tasks` | `meili get tasks [--ids <uids>] [--statuses <statuses>]` |
| `POST /tasks/cancel` | `meili cancel tasks --ids <uids>` |
| `DELETE /tasks` | `meili delete tasks --ids <uids> --yes` |
| `GET /batches` | `meili get batches [--ids <uids>] [--task-ids <uids>]` |
| `GET /keys`, `GET /keys/{key}` | `meili get keys [--id <key>]` |
| `POST /keys` | `meili add keys --actions <actions> --indexes <indexes> --expires-at <date>` |
| `PATCH /keys/{key}` | `meili update keys --id <key> [--name <name>] [--description <text>]` |
| `DELETE /keys/{key}` | `meili delete keys --id <key> --yes` |
| `POST /dumps` | `meili add dumps` |
| `POST /export` | `meili export (--url <url> \| --project-destination <name>) [--api-key <key>] [--indexes <json>]` |
| `GET /api/v2/projects`, `GET /api/v2/projects/{id}` | `meili get projects [--id <id> \| --project <name>] [--team-id <id>]` |
| `POST /api/v2/projects` | `meili add projects --name <name> --team-id <id> --resource-id <id> [--ms-version <version>] [--sync-config] [--wait [--timeout <duration>]]` |
| `PATCH /api/v2/projects/{id}` | `meili update projects (--id <id> \| --project <name>) --name <name> [--sync-config]` |
| `DELETE /api/v2/projects/{id}` | `meili delete projects (--id <id> \| --project <name>) --yes [--sync-config]` |
| `GET /api/v2/team-members` | `meili get team-members --team-id <id>` |

## Exceptions

A route whose derived name is wrong, ambiguous or collides with another one gets an explicit exception, with a reason. The exception is recorded in `ROUTE_EXCEPTIONS` of `src/lib/api-naming.ts` and in the table below. A route can also be declared without a command, `none`: a `GET` twin covered by its `POST`, a unit route covered by its list, an experimental route, a route the CLI will never expose. `*` as the method matches every method. A path ending with `/*` matches every route under that prefix, but not the prefix itself. The first matching row wins. The command column names the command, then the flags that distinguish the route. The route accepts these flags: `delete documents --ids` makes `--ids` a flag of the delete-batch route. The exception ships in the pull request of the command, and the contract test checks that the two lists match. Anything that the rules and the exceptions do not describe is a contract change.

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

These two flags work on every command, whatever it talks to.

| Flag | Meaning |
|---|---|
| `-o, --output <mode>` | `json` (default) or `ndjson`. See `output.md`. |
| `--debug` | Print every HTTP request and response on stderr, secrets redacted. |

## Shared flag groups

Commands reuse these groups. A command that matches a group uses the whole group, with the same names.

**Connection** (every command that talks to a Meilisearch project, and no other. A command that resolves no project has no way to name one):

| Flag | Meaning |
|---|---|
| `--project-url <url>` | Project URL, the Meilisearch instance to talk to. One of `--project` and `--project-url` is required. |
| `--project-api-key <key>` | Project API key. `-` reads it from stdin. |
| `--project <name>` | A project of the config file. Cannot be combined with `--project-url`. One of `--project` and `--project-url` is required. See `config.md`. |

`meili config set` writes these three values. It does not connect with them. So it declares its own three flags, with its own descriptions. `meili config update` declares its own optional ones. See ADR 0010.

**Cloud project** (every management command that acts on one project, next to its `--id`, and no other):

| Flag | Meaning |
|---|---|
| `--project <name>` | The entry of the config file whose `cloud.id` names the project, in place of `--id`. Cannot be combined with `--id`. See `config.md`. |

**Write commands** (any command whose API response is a task, and `add projects`):

| Flag | Meaning |
|---|---|
| `--wait` | Poll the task until it reaches a final status, then print the final task. On `add projects`, poll the project until its `status` is `running` or `failed`, then print it, see `output.md`. |
| `--timeout <duration>` | Maximum wait time, for example `30s`, `2m`. Default `10m`. Only with `--wait`. |

**List routes** (a `get` without `--id`, or `get documents`):

| Flag | Meaning |
|---|---|
| `--limit <n>` | Passed to the API. |
| `--offset <n>` or `--from <uid>` | Passed to the API. The name is the API parameter name for that route. |
| `--all` | Fetch every page. With `ndjson`, stream the items. With `json`, buffer them into one array. On `delete documents`, select the route that deletes every document. |

**Body input** (commands that send a JSON body):

| Flag | Meaning |
|---|---|
| `--file <path>` | Read the body from a file. `-` reads from stdin. |
| `--data <json>` | Inline JSON body. `--file` and `--data` are exclusive. |

**Delete commands** (every command of the verb `delete`, and only those):

| Flag | Meaning |
|---|---|
| `--yes` | Confirm the deletion. Required: the command refuses to run without it. No environment variable replaces it. |

**Export destination** (`export`, and no other):

| Flag | Meaning |
|---|---|
| `--project-destination <name>` | A project of the config file: the instance that receives the exported data. Its URL and its key fill the `url` and `apiKey` fields of the body. Cannot be combined with `--url`. `--api-key` replaces the key of the entry. The connection group still names the source: the instance that receives `POST /export`. `--help` lists this flag with `--url`, `--api-key` and `--payload-size` under `DESTINATION FLAGS`. See `config.md` and ADR 0012. |

**Config file** (`add projects`, `update projects`, `delete projects`):

| Flag | Meaning |
|---|---|
| `--sync-config` | Make the config file follow the command. `add` adds the created project as an entry named after the project, with its URL, its master key and its `cloud`. `update` renames the project's entry after the project and refreshes its `cloud`. `delete` removes the entry. The entry is the one `--project` names, or the one whose `cloud.id` is `--id`. See `config.md`. |

## Commands without an API

These commands have no route of their own, so no route derives them. Most of them call neither of the two APIs of this contract. The ones that do say so below. They are the only ones listed here. Their `--help` defines their shape. Their name is never the name of an API resource. The `config` and `auth` commands are for humans. An agent works with the file and the session it was given, see `config.md`. The four `auth` commands do send HTTP requests, to the authorization server of Meilisearch Cloud. No OpenAPI document of this repository describes this server. ADR 0009 says why these commands are listed here. `config sync-with-cloud` talks to the Management API itself, with `static api = "management"` and no route of its own. `config set` and `config update` do the same when `--sync-with-cloud` is given. `teleport` is an interactive command: it talks to both APIs, with `static api = "none"`, see ADR 0015.

| Command | Effect |
|---|---|
| `meili schema` | Print the index of the command tree as JSON: the global flags once, then one entry per command with its description and its routes. `meili schema --command "get indexes"` prints that one command in full: its API, its routes, its key actions, whether it returns a task, the flags it declares itself and its examples. Generated from the oclif manifest. This is how an agent learns the CLI: the index in one call, then one command when it needs it. See ADR 0008. |
| `meili config list` | Print the config file path and its projects as JSON, keys masked. |
| `meili config set --project <name> --project-url <url> [--project-api-key <key>] [--sync-with-cloud]` | Set a project in the config file. Create the file in mode `600` when it does not exist. `--project-api-key -` reads the key from stdin. `--sync-with-cloud` writes the `cloud` of the Cloud project with that URL. It also writes the master key of this project when no key is given. If no such project exists, the error is `cli_config` and nothing is written. A URL that is not HTTP(S) is refused with `cli_usage`. A name that already exists is refused with `cli_config`: to change an entry, use `config update`. Nothing on stdout. See `config.md`, "Cloud projects". |
| `meili config update --project <name> [--project-url <url>] [--project-api-key <key>] [--sync-with-cloud]` | Change the given fields of a project of the config file, and keep the others. `--project-api-key -` reads the key from stdin. `--sync-with-cloud` refreshes the entry's `cloud` from its Cloud project: the project of its `cloud.id`, else the project of its URL. It also writes the master key when the entry has no key. If no such project exists, the error is `cli_config` and nothing is written. A URL that is not HTTP(S) is refused with `cli_usage`. A name that the file does not have is refused with `cli_config`: this command never creates an entry. Nothing on stdout. See `config.md`, "Cloud projects". |
| `meili config unset --project <name>` | Remove a project from the config file. Nothing on stdout. |
| `meili config sync-with-cloud (--all \| --team-ids <ids> \| --project-name <name> \| --project-url <url>)` | Give every Meilisearch Cloud project of the scope an entry of the config file. This is the entry the project already has, found by `cloud.id` or else by URL. Otherwise it is a new entry named after the project, or `<name>-<id>` when the name is taken. Write `cloud`, and write the master key into an entry without a key. A key that the file has is never replaced. A key that the token cannot read is a warning. Never remove an entry. Prints one item per project, `{"project", "cloud", "action", "apiKey"}`, never a key. See `config.md`, "Cloud projects". |
| `meili auth login` | Run the OAuth2 flow with PKCE against Meilisearch Cloud, as the OAuth application of this CLI, `meilisearch-cli`. A human without an account creates one on the way: the consent URL opens the sign-up page, which links to the login page. Print the consent URL on stderr, and open it in a browser unless `--no-browser` is given. Receive the code on a loopback server, and write the session to the credentials file in mode `600`. Nothing on stdout: the session is the data, and it goes to the file, like `config set`. One line on stderr when stderr is a TTY. This is the one command that waits for a human: it waits five minutes, then fails with `cli_timeout` and exit 5. See `config.md`. |
| `meili auth status` | Say whether a session exists, and whether the authorization server still accepts it, through `GET /oauth/token/info`. On a live session: exit 0, and on stdout the Cloud that issued the session, the `scope`, the `expiresAt` the server reports and the path of the credentials file. Otherwise: one error and nothing on stdout, as everywhere else. The error is `cli_auth_missing` when nobody is logged in, and `cli_auth_failed` when the server no longer accepts the session. Both exit 3. An expired access token is refreshed first, as any management command does. |
| `meili auth refresh` | Exchange the refresh token of the stored session for a new access token, and write it back, without waiting for the old one to expire. Nothing on stdout. One line on stderr when stderr is a TTY. `cli_auth_missing` when nobody is logged in. `cli_auth_failed` when the session has no refresh token or the server refuses it. Both exit 3. |
| `meili auth logout` | Revoke both tokens of the session at the authorization server, and remove the credentials file. Nothing on stdout. One line on stderr when stderr is a TTY. Exit 0 when nobody is logged in. When the revocation fails, exit with the code of what failed, see `config.md`. |
| `meili teleport [--project <name>]` | An interactive command, for humans: it asks questions, and runs only when stdin and stderr are terminals. Otherwise it fails with `cli_usage`, exit 2, and the hint gives the commands that do the same. It moves the data of a Meilisearch project to a new Meilisearch Cloud project. It checks the source with `POST /export` without a body, logs in like `auth login` when needed, asks for the region, the team, the name and the plan, creates the project, adds it to the config file, exports the data, and waits until the new project has no task to process. It talks to both APIs. Everything it shows goes to stderr, and nothing goes to stdout. In a terminal, its errors are text for a human. Ctrl-C exits 130. See ADR 0015. |
| `meili --version` | CLI version only. No network call. |

## Not in scope

`meili` must be coding agent friendly. No command prompts, asks a question, opens `$EDITOR` or takes a positional argument. Interactive commands, such as `teleport`, are for humans: they ask questions in a terminal and refuse to run without one (ADR 0015). `--yes` of the `delete` commands is none of those: it is a flag the agent writes, and nothing waits for an answer. Human comfort is part of the documentation and the `--help` from the start. Comfort commands for humans, such as shell completions, interactive modes, TUIs or wizards, come later. Each one comes through a contract pull request, and never changes how the other commands behave. These are also not planned: starting a local Meilisearch, self-update, chat, a guide command, dry runs, splitting a large documents file into batches, running a Meilisearch API command against a Cloud project by its id, NDJSON or CSV documents as long as the OpenAPI document does not declare them. If you think one of them belongs here, open a contract pull request.

## Milestones

1. The Meilisearch API: every stable route of `meilisearch-openapi.json`, plus `schema`. Release 1.0.
2. The Management API. Release 1.x.
