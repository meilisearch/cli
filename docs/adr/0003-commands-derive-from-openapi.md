# ADR 0003: Commands derive from the OpenAPI documents, verb first, HTTP stays in generated clients

Status: accepted. Date: 2026-09-29.

## Context

Handwritten HTTP clients drift from the API: untyped bodies, query strings built by string concatenation without URL encoding, the same parameters copied across commands. When a coding agent writes HTTP calls by hand, it also invents endpoints and fields that do not exist. We want the compiler to reject a call to something that does not exist, and the tests to reject a command name that does not come from the API.

Both APIs publish an OpenAPI document. Meilisearch attaches `meilisearch-openapi.json` to every release. The Management API keeps `api/swagger/v2/swagger.yaml` in the private `meilisearch/meilisearch-cloud` repository. A contract that listed every command would need a pull request before the pull request of each route, and would drift from documents nobody has to consult to add a route to an API.

The grammar matters as much as the derivation. Coding agents have a strong prior from `kubectl`: a verb first, a plural resource, named flags for everything, `kubectl get pods --namespace web`. A grammar that follows that prior is one an agent gets right on the first try. A grammar with one command per route would also give the agent ninety names to discover where a dozen verbs and nouns say the same thing.

## Decision

- The OpenAPI documents are the reference for what a command is named and what it takes. `docs/contract/commands.md` states the naming rules, not the commands. `src/lib/api-naming.ts` implements the rules and `test/contract/api.test.ts` enforces them.
- The grammar is `meili <verb> <resources> [flags]`. The verb comes from the HTTP method, `get`, `create`, `update`, `delete`, or from a trailing literal of the route taken from a closed list, `cancel`, `compact`, `swap`. The resource is the last literal segment of the path, plural. The most typed commands, `search`, `similar`, `facet-search`, `multi-search`, `export`, carry no resource word, as recorded exceptions. Every value is a named flag: no positional argument, so an agent names what it passes and never has to know an order.
- One command covers every route that shares its verb and resource, and the flags select the route: `get indexes` lists or, with `--id`, gets one; `delete documents` deletes by `--ids`, by `--filter` or everything with `--all`. Flags that call for two routes at once are a usage error. The command declares its routes, `static routes`, and the contract test checks that each is reachable by a distinct set of flags.
- Identifiers: the resource's own identifier is `--id`, or `--ids` when the list route filters by identifiers, in which case the unit route is not implemented and `--id` is an alias. A parent in the path is a flag named after its collection, `--index`. A query or body parameter that carries identifiers is named after the resource it identifies, `--ids` for the command's own resource, `--batch-ids` or `--task-ids` for another, whatever the API spelling, which stays accepted as an alias. Every other body field keeps its API name.
- The documents are downloaded, never committed. `pnpm openapi` fetches the Meilisearch API document from the latest release, or from the release in `MEILISEARCH_VERSION`, and the management document with a GitHub token that reads the private repository (`gh auth login` on a workstation, `MEILI_BOT_GH_PAT` in CI). A missing document fails the contract tests: nobody writes a command without seeing the route.
- A route whose derived name is wrong, ambiguous or in collision gets an explicit exception, in the code and in the contract, with a reason, in the pull request of the command. A route can be declared without command: a `GET` twin of a `POST`, a unit route covered by its list, a settings sub-route, an experimental route. Anything else is a contract change.
- When a document does not describe what a command needs, the fix goes to the document upstream, not to a guess in the CLI.
- Meilisearch API: `meilisearch-js`, the official SDK. When the SDK lacks a route, the fix goes to the SDK first, and the CLI uses `client.httpRequest` from the SDK as a temporary measure with a link to the SDK issue.
- Management API: a client generated with `@hey-api/openapi-ts` from the downloaded document into `src/lib/clients/management/generated/`. Generated files are committed and never edited by hand. `pnpm gen:management` regenerates them. CI fails if the committed files differ from a fresh generation.
- No `fetch` outside `src/lib/clients/`.

## Consequences

- Adding a command is one pull request: the command with all its routes, its tests, the manifest, a changeset, and an exception only if the rules give a wrong name. Fifty-odd commands cover the ninety-odd stable routes of the two APIs.
- `meili get --help` lists every resource on one screen. The agent learns one verb set and one flag convention, not a tree.
- The command tree follows the APIs. `pnpm api:coverage` prints every route with its command name and whether it exists.
- Some derived names read oddly to a human: `create indexes --id movies` creates one index, `create dumps` creates one dump. One spelling, always plural, beats two spellings an agent has to choose between. On a typo, the `cli_usage` error carries a hint with the closest existing command, "Did you mean `meili delete indexes`?", computed from the manifest; the CLI suggests, it never asks.
- A command that filters a list instead of calling a unit route, `get tasks --ids 42`, returns the list envelope and the agent reads `results[0]`. In exchange the agent never has to know whether a route exists for one item.
- `BaseCommand` owns a small dispatcher: which route the given flags select, which flags conflict, which are ignored. Commands stay declarative: routes, flags, one call.
- Types come from the SDK and the generator, so `--help` descriptions and output shapes cannot drift from the API without a compile error. An undocumented parameter is a documentation bug to fix upstream before the flag exists in the CLI.
- Contributors need network access once to download the documents, and a GitHub token for the Management API. CI needs the `MEILI_BOT_GH_PAT` secret.
- The CLI depends on the release cadence of `meilisearch-js` for new Meilisearch features, and on the OpenAPI document for what it accepts: documents are JSON only until the document declares NDJSON and CSV.
