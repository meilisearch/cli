# ADR 0003: Commands derive from the OpenAPI documents, verb first, HTTP stays in generated clients

Status: accepted. Date: 2026-09-29.

## Context

Handwritten HTTP clients drift from the API. They have untyped bodies, query strings built by string concatenation without URL encoding, and the same parameters copied across commands. A coding agent that writes HTTP calls by hand also invents endpoints and fields that do not exist. We want the compiler to reject a call to something that does not exist. We want the tests to reject a command name that does not come from the API.

Both APIs publish an OpenAPI document. Meilisearch attaches `meilisearch-openapi.json` to every release. The Management API keeps `api/swagger/v2/swagger.yaml` in the private `meilisearch/meilisearch-cloud` repository. A contract that listed every command would need its own pull request before the pull request of each route. It would also drift, because nobody has to read it to add a route to an API.

The grammar matters as much as the derivation. Coding agents have strong expectations learned from `kubectl`: a verb first, a plural resource, named flags for everything, `kubectl get pods --namespace web`. An agent gets a grammar that follows these expectations right on the first try. A grammar with one command per route would give the agent ninety names to discover, where a dozen verbs and nouns say the same thing.

## Decision

- The OpenAPI documents are the reference for the name of a command and for what it takes. `docs/contract/commands.md` states the naming rules, not the commands. `src/lib/api-naming.ts` implements the rules and `test/contract/api.test.ts` enforces them.
- The grammar is `meili <verb> <resources> [flags]`. The verb comes from the HTTP method (`get`, `add`, `update`, `delete`), or from a trailing literal of the route taken from a closed list (`cancel`, `compact`, `swap`). The resource is the last literal segment of the path, in the plural. The most typed commands (`search`, `similar`, `facet-search`, `multi-search`, `export`) have no resource word. They are recorded exceptions. Every value is a named flag. There is no positional argument, so an agent names what it passes and never has to know an order.
- `POST` is `add`, not `create`. Both words read well with `indexes` and with `keys`. Only `add` reads well with `documents`, the most typed write command, and the API itself calls it `documents.add`. `add` is also short, three letters, and it is the first word an agent tries after `get`. The cost: the CLI verb no longer matches the `indexes.create` and `keys.create` key actions of the other resources. A command declares its key actions in `static keyActions`, read from the document, so neither name is derived from the other.
- One command covers every route with the same verb and resource. The flags select the route. `get indexes` lists the indexes, or gets one with `--id`. `delete documents` deletes by `--ids` or by `--filter`, or deletes everything with `--all`. Flags that select two routes at once are a usage error. The command declares its routes in `static routes`. The contract test checks that a distinct set of flags reaches each route.
- Identifiers: the resource's own identifier is `--id`. It is `--ids` when the list route filters by identifiers. In that case the unit route is not implemented, and `--id` is an alias. A parent in the path is a flag named after its collection, `--index`. A query or body parameter that carries identifiers is named after the resource it identifies: `--ids` for the command's own resource, `--batch-ids` or `--task-ids` for another resource. This applies whatever the API spelling is, and the API spelling stays accepted as an alias. Every other body field keeps its API name.
- The documents are downloaded, never committed. `pnpm openapi` fetches the Meilisearch API document from the latest release, or from the release in `MEILISEARCH_VERSION`. It fetches the management document with a GitHub token that can read the private repository (`gh auth login` on a workstation, `MEILI_BOT_GH_PAT` in CI). A missing document makes the contract tests fail: nobody writes a command without seeing the route.
- Sometimes the derived name of a route is wrong, ambiguous or in collision with another name. That route gets an explicit exception, with a reason, in the code and in the contract, in the pull request of the command. A route can be declared without a command: a `GET` twin of a `POST`, a unit route covered by its list, a settings sub-route, an experimental route. Anything else is a contract change.
- When a document does not describe what a command needs, the fix goes to the document upstream, not to a guess in the CLI.
- Meilisearch API: `meilisearch-js`, the official SDK. When the SDK lacks a route, the fix goes to the SDK first. Until then, the CLI uses `client.httpRequest` from the SDK as a temporary measure, with a link to the SDK issue.
- Management API: a client generated with `@hey-api/openapi-ts` from the downloaded document into `src/lib/clients/management/generated/`. Generated files are committed and never edited by hand. `pnpm gen:management` regenerates them. CI fails if the committed files differ from a fresh generation.
- No `fetch` outside `src/lib/clients/`.

## Consequences

- Adding a command is one pull request: the command with all its routes, its tests, the manifest, a changeset, and an exception only if the rules give a wrong name. More than fifty commands cover the more than ninety stable routes of the two APIs.
- `meili get --help` lists every resource on one screen. The agent learns one set of verbs and one flag convention, not a tree.
- The command tree follows the APIs. `pnpm api:coverage` prints every route with its command name and whether that command exists.
- Some derived names look strange to a human: `add indexes --id movies` adds one index, and `add dumps` creates one dump. One spelling, always plural, is better than two spellings to choose from. On a typo, the `cli_usage` error has a hint with the closest existing command, computed from the manifest: "Did you mean `meili delete indexes`?". The CLI suggests; it never asks.
- Some commands filter a list instead of calling a unit route, like `get tasks --ids 42`. Such a command returns the list envelope, and the agent reads `results[0]`. In exchange, the agent never has to know whether a route exists for one item.
- `BaseCommand` owns a small dispatcher. It decides which route the given flags select, which flags conflict and which flags are ignored. Commands stay declarative: routes, flags, one call.
- Types come from the SDK and the generator. So `--help` descriptions and output shapes cannot drift from the API without a compile error. An undocumented parameter is a documentation bug. It is fixed upstream before the flag exists in the CLI.
- Contributors need network access once to download the documents, and a GitHub token for the Management API. CI needs the `MEILI_BOT_GH_PAT` secret.
- The CLI depends on the releases of `meilisearch-js` for new Meilisearch features. It depends on the OpenAPI document for what it accepts: documents are JSON only until the OpenAPI document declares NDJSON and CSV.
