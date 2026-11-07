# Command contract

`meili` mirrors the two APIs it talks to. A command exists for the routes of the Meilisearch API or of the Management API as soon as someone implements it. By default, its name and flags derive from those routes by the rules of this file. The rules give the default name, not the only one: the maintainers may choose another name, case by case, and record it as an exception (ADR 0018). There is no list of commands to update first. The OpenAPI documents are the reference, `oclif.manifest.json` and `meili schema` are the list, and `pnpm api:coverage` shows what remains.

Grammar: `meili [global flags] <resource> <verb> [flags]`, for example `meili index view --id movies` or `meili document delete --index movies --ids 1,2`. The resource comes first, in the singular, then the verb (ADR 0018). Every value goes in a named flag. There is no positional argument, so you can read a command without knowing the order of its parameters. One command covers every route that has the same resource and the same verb. The flags given choose the route.

## The OpenAPI documents

| API | Document | Access |
|---|---|---|
| Meilisearch API | `meilisearch-openapi.json`, an asset of every Meilisearch release: `https://github.com/meilisearch/meilisearch/releases/download/<tag>/meilisearch-openapi.json` | public |
| Management API | `api/swagger/v2/swagger.yaml` on the `main` branch of the `meilisearch/meilisearch-cloud` repository | private: `gh auth login` on a workstation, the `MEILI_BOT_GH_PAT` secret in CI |

`pnpm openapi` downloads both into `openapi/`, as `meilisearch.json` and `management.json`. They are never committed. `pnpm openapi:meilisearch` takes the latest release, or the release named by `MEILISEARCH_VERSION`. The contract tests read these files and fail when they are missing: no command is checked or written without the document that describes its routes. CI downloads them before the tests.

When the document does not describe what a command needs (the route, a parameter, a response field), stop and ask the maintainers. Do not guess. Do not look for the answer in the Meilisearch source code. The document is the contract, and the fix is to correct the document upstream.

## Naming rules

Every API command declares its routes, `static routes = ["GET /stats", "GET /indexes/{index_uid}/stats"]`, written as in the document. It also declares the key actions those routes require, `static keyActions = ["stats.get"]`: the specific action of each `security` entry of the document, empty when the routes need none. `meili schema --command` prints both, and `test/contract/api.test.ts` checks both against the document. The rules below turn routes into a command name and its flags. `src/lib/api-naming.ts` implements them, and `test/contract/api.test.ts` enforces them.

1. **Verb.** The HTTP method gives the verb. `GET` is `list` when the path ends with a collection, `GET /indexes`, and `view` otherwise: the path ends with a parameter, `GET /indexes/{index_uid}`, or with an object, `GET /indexes/{index_uid}/settings` (rule 2). `POST` is `add`, `PUT` and `PATCH` are `update`, `DELETE` is `delete`. When the last segment of the path is a literal that names an action, this action replaces the verb: `POST /tasks/cancel` gives `task cancel`, `POST /indexes/{index_uid}/compact` gives `index compact`, `POST /indexes/{index_uid}/documents/delete` gives `document delete`. The literal verbs are a closed list: `delete`, `cancel`, `compact`, `swap`, `search`, `similar`, `facet-search`, `multi-search`, `export`. Adding one is a contract change.
2. **Resource.** The resource is the last literal segment of the path that names a resource, in kebab-case of the API name, without the `/api/v2` prefix of the Management API. A collection takes its singular, from `COLLECTIONS` in `src/lib/api-naming.ts`: `indexes` is `index`, `batches` is `batch`, `team-members` is `team-member`. A new collection adds a row to this table. A resource that is one object keeps its API name: `settings`, `stats`, `health`. When `view` is the only command of such a resource, the command is the resource alone, with no verb: `meili health`, `meili stats`. `VIEW_ONLY` in the same file lists these resources. Five commands have no resource word, because people type them the most: `search`, `similar`, `facet-search`, `multi-search`, `export`. The exceptions list them.
3. **Several routes, one command.** Every route with the same resource and verb belongs to one command: `GET /stats` and `GET /indexes/{index_uid}/stats` are `stats`, the three deletion routes of documents are `document delete`. The flags choose the route: first the route whose path parameters are exactly the identifier flags given, then the route whose parameters cover the other flags given. Two flags that call for different routes are a usage error, `cli_usage`, exit 2, before any network call. For example, `--ids` and `--filter` on `document delete`.
4. **Identifiers.** The path parameter of the resource itself is `--id`: `index view --id movies`, `key delete --id <key>`, `project view --id 343`, `task view --id 42`. A list route that filters by identifiers takes `--ids`: `document list --index movies --ids 42,1344` calls the fetch route, `task list --ids 1,2` filters `GET /tasks`, `batch list --ids 7` filters `GET /batches`. The path parameter of a parent resource is a flag named after that collection, in the singular: `--index movies`. This flag is required when every route of the command takes it, and optional when one of the routes does not. For example, `--index` is required on `settings view`, and optional on `stats`, whose other route is `GET /stats`. The verb-only commands take the index the same way: `search --index movies`. On the Management API, a parent parameter keeps its API name in kebab-case: `{projectId}` is `--project-id`. The reason is that `--project` names an entry of the config file, and the `cloud.id` of this entry can replace `--id` or `--project-id` (`config.md`, "Cloud projects").
5. **Identifiers are named by what they identify.** A query or body parameter that carries identifiers, `uid`, `uids`, `batchUids`, `indexUids`, is named after the resource it identifies. The command's own resource gives `--id` or `--ids`. Another resource gives `--<resource>-ids`. So `index add --id movies` and `key add --id <uuid>` carry `uid`. `task list --ids 1,2 --batch-ids 7 --index-ids movies` carries `uids`, `batchUids` and `indexUids`. `batch list --ids 7 --task-ids 1,2` carries `batchUids` and `uids`, because bare `uids` are always task identifiers. The API spellings, `--uid`, `--uids`, `--batch-uids`, `--index-uids`, are accepted as aliases. They do not appear in `--help` or `meili schema`. One exception: on `index update`, `--id` is the index itself, so the new `uid` is `--new-id`, with the alias `--uid`. Every other body field keeps its API name: `--primary-key`, `--name`.
6. **Other flags.** The query parameters and the first-level fields of the JSON body are flags, in kebab-case of the API name: `retrieveVectors` is `--retrieve-vectors`, `teamId` is `--team-id`, `primaryKey` is `--primary-key`. Only the global flags and the CLI-owned flags do not come from a route: `--wait`, `--timeout`, `--all`, `--file`, `--data`, `--yes`, `--sync-config`, `--sync-with-cloud`, `--project-destination`.
7. **Values.** A scalar is passed as it is. A boolean is a bare flag, `--retrieve-vectors`. The exception is a route that also reads `false` from the value, as the settings do. There the flag takes a value, `--facet-search false`, because a bare flag says neither `false` nor `null`. An array of scalars is comma-separated, `--fields id,title`, like the API's own GET syntax. An object or a nested array is JSON text: `--typo-tolerance '{"enabled":false}'`. The value `null` sends a JSON null: `--expires-at null`, `--stop-words null`.
8. **Body input.** On every route with a body, `--file <path>` or `--data '<json>'` replaces the body fields. `--file -` reads stdin. Path and query flags stay valid next to them. A body-field flag given together with `--file` or `--data` overrides that field, as a flag overrides its environment variable. On some routes, the body is not an object of named fields but the value itself: the array of identifiers of `document delete --ids`, or the documents of `document add`. There the body is that value, and its shape selects the route among the routes of the command: `document delete --data '[1,2]'` deletes by identifiers, `--data '{"filter":…}'` deletes by filter. Documents are sent as JSON, the only content type the document declares.
9. **Routes that are not implemented.** These routes are not implemented: the `GET` twin of a `POST` route that takes the same parameters in a body (search, similar, the list of documents); the deletion of one document, covered by `document delete --ids`; the settings sub-routes, because `settings update` sends any subset and `null` resets one setting; `GET /api/v2/meilisearch-versions`. Each one is recorded in the exceptions, without a command.
10. **Experimental routes** are out of the contract until the feature is stable. Implementing one is a contract change: it needs an exception row with the reason. `compact` is the one exception today. A body field or a query parameter that an experimental feature gates is also out of the contract. The command declares no flag for it, and `--data` or `--file` still sends it to the API. These fields are `useNetwork` on `document list`; `media`, `personalize`, `useNetwork` and `inlineRule` on `search`; and `media` and `useNetwork` on `facet-search`. They are not in the exceptions table, which lists routes.
11. **Destructive commands.** A command of the verb `delete` takes `--yes` and refuses to run without it: `cli_usage`, exit 2, before any network call. `--yes` is a flag that you write. It is never a question the CLI asks. See `output.md`.

| Routes | Command |
|---|---|
| `GET /health` | `meili health` |
| `GET /version` | `meili info` |
| `GET /stats`, `GET /indexes/{index_uid}/stats` | `meili stats [--index <index>]` |
| `GET /indexes` | `meili index list` |
| `GET /indexes/{index_uid}` | `meili index view --id <index>` |
| `POST /indexes` | `meili index add --id <index> [--primary-key <field>]` |
| `PATCH /indexes/{index_uid}` | `meili index update --id <index> [--primary-key <field>] [--new-id <index>]` |
| `DELETE /indexes/{index_uid}` | `meili index delete --id <index> --yes` |
| `POST /indexes/{index_uid}/compact` | `meili index compact --id <index>` |
| `POST /swap-indexes` | `meili index swap --indexes <a>,<b>` |
| `POST /indexes/{index_uid}/documents/fetch` | `meili document list --index <index> [--ids <ids>] [--filter <filter>]` |
| `GET /indexes/{index_uid}/documents/{document_id}` | `meili document view --index <index> --id <id>` |
| `POST /indexes/{index_uid}/documents` | `meili document add --index <index> --file <path>` |
| `PUT /indexes/{index_uid}/documents` | `meili document update --index <index> --file <path>` |
| `POST …/documents/delete-batch`, `POST …/documents/delete`, `DELETE …/documents` | `meili document delete --index <index> (--ids <ids> \| --filter <filter> \| --all) --yes` |
| `POST /indexes/{index_uid}/search` | `meili search --index <index> --q <query>` |
| `POST /indexes/{index_uid}/similar` | `meili similar --index <index> --id <document> --embedder <embedder>` |
| `POST /indexes/{index_uid}/facet-search` | `meili facet-search --index <index> --facet-name <attribute>` |
| `POST /multi-search` | `meili multi-search --queries <json> [--federation <json>]` |
| `GET /indexes/{index_uid}/settings` | `meili settings view --index <index>` |
| `PATCH /indexes/{index_uid}/settings` | `meili settings update --index <index> --<setting> <value>` |
| `DELETE /indexes/{index_uid}/settings` | `meili settings delete --index <index> --yes` |
| `GET /tasks` | `meili task list [--ids <uids>] [--statuses <statuses>]` |
| `GET /tasks/{task_id}` | `meili task view --id <uid>` |
| `POST /tasks/cancel` | `meili task cancel --ids <uids>` |
| `DELETE /tasks` | `meili task delete --ids <uids> --yes` |
| `GET /batches` | `meili batch list [--ids <uids>] [--task-ids <uids>]` |
| `GET /batches/{batch_id}` | `meili batch view --id <uid>` |
| `GET /keys` | `meili key list` |
| `GET /keys/{key}` | `meili key view --id <key>` |
| `POST /keys` | `meili key add --actions <actions> --indexes <indexes> --expires-at <date>` |
| `PATCH /keys/{key}` | `meili key update --id <key> [--name <name>] [--description <text>]` |
| `DELETE /keys/{key}` | `meili key delete --id <key> --yes` |
| `POST /dumps` | `meili dump add` |
| `POST /export` | `meili export (--url <url> \| --project-destination <name>) [--api-key <key>] [--indexes <json>]` |
| `GET /api/v2/projects` | `meili project list [--team-id <id>]` |
| `GET /api/v2/projects/{id}` | `meili project view (--id <id> \| --project <name>)` |
| `POST /api/v2/projects` | `meili project add --name <name> --team-id <id> --resource-id <id> [--ms-version <version>] [--sync-config] [--wait [--timeout <duration>]]` |
| `PATCH /api/v2/projects/{id}` | `meili project update (--id <id> \| --project <name>) --name <name> [--sync-config]` |
| `DELETE /api/v2/projects/{id}` | `meili project delete (--id <id> \| --project <name>) --yes [--sync-config]` |
| `GET /api/v2/organizations` | `meili organization list` |
| `GET /api/v2/organizations/{id}` | `meili organization view --id <id>` |
| `PATCH /api/v2/organizations/{id}` | `meili organization update --id <id> --name <name>` |
| `DELETE /api/v2/organizations/{id}` | `meili organization delete --id <id> --yes` |
| `GET /api/v2/regions` | `meili region list` |
| `GET /api/v2/teams` | `meili team list` |
| `GET /api/v2/teams/{id}` | `meili team view --id <id>` |
| `POST /api/v2/teams` | `meili team add --organization-id <id> [--name <name>]` |
| `PATCH /api/v2/teams/{id}` | `meili team update --id <id> [--name <name>] [--owner-id <uuid>]` |
| `DELETE /api/v2/teams/{id}` | `meili team delete --id <id> --yes` |
| `GET /api/v2/team-members` | `meili team-member list --team-id <id>` |
| `GET /api/v2/resources` | `meili resource list [--region-id <id>]` |

## Exceptions

A route gets an explicit exception, with a reason, when the maintainers choose another name than the derived one. The derived name may be wrong, ambiguous or in collision with another one. Or another name may simply read better for a human or an agent, as `info` for `GET /version`. An agent that adds a command uses the derived name, and proposes another one to a human, who decides. The exception is recorded in `ROUTE_EXCEPTIONS` of `src/lib/api-naming.ts` and in the table below. A route can also be declared without a command, `none`: a `GET` twin covered by its `POST`, a route covered by another command, an experimental route, a route the CLI will never expose. `*` as the method matches every method. A path ending with `/*` matches every route under that prefix, but not the prefix itself. The first matching row wins. The command column names the command, then the flags that distinguish the route. The route accepts these flags: `document delete --ids` makes `--ids` a flag of the delete-batch route. The exception ships in the pull request of the command, and the contract test checks that the two lists match. Anything that the rules and the exceptions do not describe is a contract change.

| Route | Command | Reason |
|---|---|---|
| `GET /indexes/{index_uid}/search` | none | Twin of the POST route, which takes the same parameters in a body. The CLI implements POST. |
| `POST /indexes/{index_uid}/search` | `search --index` | Verb only, the most typed command. |
| `GET /indexes/{index_uid}/similar` | none | Twin of the POST route. The CLI implements POST. |
| `POST /indexes/{index_uid}/similar` | `similar --index` | Verb only, like `search`. `--id` is the API field: the document to compare with. |
| `POST /indexes/{index_uid}/facet-search` | `facet-search --index` | Verb only, like `search`. |
| `POST /multi-search` | `multi-search` | Verb only, like `search`. No index: the queries name theirs. |
| `POST /export` | `export` | Verb only: the route has no resource. |
| `POST /swap-indexes` | `index swap --indexes` | The literal holds the verb and the resource. `--indexes a,b` swaps one pair; several pairs go through `--data` or `--file`. |
| `GET /version` | `info` | `meili version` prints the version of the CLI. `info` describes the instance: its version and the commit it was built from. |
| `GET /indexes/{index_uid}/documents` | none | Covered by `document list`, which uses the fetch route and its body. |
| `POST /indexes/{index_uid}/documents/fetch` | `document list --index` | A POST that lists: filters, fields and pagination travel in its body. |
| `DELETE /indexes/{index_uid}/documents/{document_id}` | none | Covered by `document delete --ids`. |
| `POST /indexes/{index_uid}/documents/delete-batch` | `document delete --ids` | The body is an array of identifiers without a name; `--ids` is the name of the fetch route. |
| `POST /indexes/{index_uid}/fields` | `field list --index` | A POST that lists. |
| `* /indexes/{index_uid}/settings/*` | none | `settings update` sends any subset of the settings; `null` resets one of them. |
| `POST /tasks/compact` | `task compact` | Experimental (`taskQueueCompactionRoute`), kept on purpose. |
| `PATCH /api/v2/projects/{projectId}/version` | none | Not needed for now. `meili version` prints the version of the CLI. |
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

These flags work on every command, whatever it talks to. `--json` and `--no-color` are the output flags, see "Format" in `output.md`.

| Flag | Meaning |
|---|---|
| `--json` | Print compact JSON. The default when stdout is not a terminal. |
| `--no-color` | Print without colors. `NO_COLOR` does the same. |
| `--debug` | Print every HTTP request and response on stderr, secrets redacted. |

## Short flags

`-p` is the short form of `--project`, and `-i` the short form of `--index`, on every command that declares the flag. They are the only short forms, besides `-h` for `--help`. A new one is a contract change, with its own ADR. In the examples of `--help`, the first example that uses the flag writes its long form, and the next ones write its short form. See ADR 0022.

## Shared flag groups

Commands reuse these groups. A command that matches a group uses the whole group, with the same names.

**Connection** (every command that talks to a Meilisearch project, and no other. A command that resolves no project has no way to name one):

| Flag | Meaning |
|---|---|
| `--project-url <url>` | Project URL, the Meilisearch instance to talk to. One of `--project` and `--project-url` is required. |
| `--project-api-key <key>` | Project API key. `-` reads it from stdin. |
| `--project <name>`, `-p <name>` | A project of the config file. Cannot be combined with `--project-url`. One of `--project` and `--project-url` is required. See `config.md`. |

`meili config set` writes these three values. It does not connect with them. So it declares its own three flags, with its own descriptions. `meili config update` declares its own optional ones. See ADR 0010.

**Cloud project** (every management command that acts on one project, next to its `--id`, and no other):

| Flag | Meaning |
|---|---|
| `--project <name>`, `-p <name>` | The entry of the config file whose `cloud.id` names the project, in place of `--id`. Cannot be combined with `--id`. See `config.md`. |

**Write commands** (any command whose API response is a task, and `project add`):

| Flag | Meaning |
|---|---|
| `--wait` | Poll the task until it reaches a final status, then print the final task. On `project add`, poll the project until its `status` is `running` or `failed`, then print it, see `output.md`. |
| `--timeout <duration>` | Maximum wait time, for example `30s`, `2m`. Default `10m`. Only with `--wait`. |

**List routes** (the `list` commands of the Meilisearch API. Those of the Management API wait, see `output.md`, Pagination):

| Flag | Meaning |
|---|---|
| `--limit <n>` | Passed to the API. |
| `--offset <n>` or `--from <uid>` | Passed to the API. The name is the API parameter name for that route. |
| `--all` | Fetch every page, and print them as one list. `document list` has no `--all`: an index can hold millions of documents. On `document delete`, select the route that deletes every document. |

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

**Config file** (`project add`, `project update`, `project delete`):

| Flag | Meaning |
|---|---|
| `--sync-config` | Make the config file follow the command. `add` adds the created project as an entry named after the project, with its URL, its master key and its `cloud`. `update` renames the project's entry after the project and refreshes its `cloud`. `delete` removes the entry. The entry is the one `--project` names, or the one whose `cloud.id` is `--id`. See `config.md`. |

## Commands without an API

These commands have no route of their own, so no route derives them. Most of them call neither of the two APIs of this contract. The ones that do say so below. They are the only ones listed here. Their `--help` defines their shape. Their name is never the name of an API resource. The `config` and `auth` commands are for humans. An agent works with the file and the session it was given, see `config.md`. The four `auth` commands do send HTTP requests, to the authorization server of Meilisearch Cloud. No OpenAPI document of this repository describes this server. ADR 0009 says why these commands are listed here. `config sync-with-cloud` talks to the Management API itself, with `static api = "management"` and no route of its own. `config set` and `config update` do the same when `--sync-with-cloud` is given. `teleport` is an interactive command: it talks to both APIs, with `static api = "none"`, see ADR 0015.

| Command | Effect |
|---|---|
| `meili schema` | Print the index of the command tree as JSON: the global flags once, then one entry per command with its description and its routes. `meili schema --command "index list"` prints that one command in full: its API, its routes, its key actions, whether it returns a task, the flags it declares itself and its examples. Generated from the oclif manifest. This is how an agent learns the CLI: the index in one call, then one command when it needs it. See ADR 0008. |
| `meili version` | Print the version of the CLI, the platform and the Node version as JSON, `{"version": "0.2.0", "platform": "darwin-arm64", "node": "v22.12.0"}`. See ADR 0021. |
| `meili config list` | Print the config file path and its projects as JSON, keys masked. |
| `meili config set --project <name> --project-url <url> [--project-api-key <key>] [--sync-with-cloud]` | Set a project in the config file. Create the file in mode `600` when it does not exist. `--project-api-key -` reads the key from stdin. `--sync-with-cloud` writes the `cloud` of the Cloud project with that URL. It also writes the master key of this project when no key is given. If no such project exists, the error is `cli_config` and nothing is written. A URL that is not HTTP(S) is refused with `cli_usage`. A name that already exists is refused with `cli_config`: to change an entry, use `config update`. Nothing on stdout. See `config.md`, "Cloud projects". |
| `meili config update --project <name> [--project-url <url>] [--project-api-key <key>] [--sync-with-cloud]` | Change the given fields of a project of the config file, and keep the others. `--project-api-key -` reads the key from stdin. `--sync-with-cloud` refreshes the entry's `cloud` from its Cloud project: the project of its `cloud.id`, else the project of its URL. It also writes the master key when the entry has no key. If no such project exists, the error is `cli_config` and nothing is written. A URL that is not HTTP(S) is refused with `cli_usage`. A name that the file does not have is refused with `cli_config`: this command never creates an entry. Nothing on stdout. See `config.md`, "Cloud projects". |
| `meili config unset --project <name>` | Remove a project from the config file. Nothing on stdout. |
| `meili config sync-with-cloud (--all \| --team-ids <ids> \| --project-name <name> \| --project-url <url>)` | Give every Meilisearch Cloud project of the scope an entry of the config file. This is the entry the project already has, found by `cloud.id` or else by URL. Otherwise it is a new entry named after the project, or `<name>-<id>` when the name is taken. Write `cloud`, and write the master key into an entry without a key. A key that the file has is never replaced. A key that the token cannot read is a warning. Never remove an entry. Prints one item per project, `{"project", "cloud", "action", "apiKey"}`, never a key. See `config.md`, "Cloud projects". |
| `meili auth login` | Run the OAuth2 flow with PKCE against Meilisearch Cloud, as the OAuth application of this CLI, `meilisearch-cli`. A human without an account creates one on the way: the consent URL opens the page "Log in or create a new account", which offers GitHub and Google and links to the login page. Print the consent URL on stderr, and open it in a browser unless `--no-browser` is given. Receive the code on a loopback server, and write the session to the credentials file in mode `600`. Nothing on stdout: the session is the data, and it goes to the file, like `config set`. One line on stderr when stderr is a TTY. This is the one command that waits for a human: it waits five minutes, then fails with `cli_timeout` and exit 5. See `config.md`. |
| `meili auth status` | Say whether a session exists, and whether the authorization server still accepts it, through `GET /oauth/token/info`. On a live session: exit 0, and on stdout one object: `user`, the body of `GET /api/v2/me` (`id`, `name`, `email`), then the Cloud that issued the session, the `scope`, the `expiresAt` the server reports and the path of the credentials file. Otherwise: one error and nothing on stdout, as everywhere else. The error is `cli_auth_missing` when nobody is logged in, and `cli_auth_failed` when the server no longer accepts the session. Both exit 3. An expired access token is refreshed first, as any management command does. |
| `meili auth refresh` | Exchange the refresh token of the stored session for a new access token, and write it back, without waiting for the old one to expire. Nothing on stdout. One line on stderr when stderr is a TTY. `cli_auth_missing` when nobody is logged in. `cli_auth_failed` when the session has no refresh token or the server refuses it. Both exit 3. |
| `meili auth logout` | Revoke both tokens of the session at the authorization server, and remove the credentials file. Nothing on stdout. One line on stderr when stderr is a TTY, also when nobody is logged in. Exit 0 when nobody is logged in. When the revocation fails, exit with the code of what failed, see `config.md`. |
| `meili teleport [--project <name>]` | An interactive command, for humans: it asks questions, and runs only when stdin and stderr are terminals. Otherwise it fails with `cli_usage`, exit 2, and the hint gives the commands that do the same. It moves the data of a Meilisearch project to a new Meilisearch Cloud project. It checks the source with `POST /export` without a body, logs in like `auth login` when needed, asks for the region, the team, the name and the plan, creates the project, adds it to the config file, exports the data, and waits until the new project has no task to process. It talks to both APIs. Everything it shows goes to stderr, and nothing goes to stdout. In a terminal, its errors are text for a human. Ctrl-C exits 130. Once the export is enqueued, Ctrl-C exits 0: the transfer continues in Meilisearch Cloud, and the command shows the links to the batches, the preview and the settings of the new project. See ADR 0015. |
| `meili --version` | Runs `meili version`. No API call. |

## Not in scope

`meili` must be coding agent friendly. No command prompts, asks a question, opens `$EDITOR` or takes a positional argument. Interactive commands, such as `teleport`, are for humans: they ask questions in a terminal and refuse to run without one (ADR 0015). `--yes` of the `delete` commands is none of those: it is a flag the agent writes, and nothing waits for an answer. Human comfort is part of the documentation and the `--help` from the start. Comfort commands for humans, such as shell completions, interactive modes, TUIs or wizards, come later. Each one comes through a contract pull request, and never changes how the other commands behave. These are also not planned: starting a local Meilisearch, self-update, chat, a guide command, dry runs, splitting a large documents file into batches, running a Meilisearch API command against a Cloud project by its id, NDJSON or CSV documents as long as the OpenAPI document does not declare them. If you think one of them belongs here, open a contract pull request.

## Milestones

1. The Meilisearch API: every stable route of `meilisearch-openapi.json`, plus `schema`. Release 1.0.
2. The Management API. Release 1.x.
