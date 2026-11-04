---
name: add-command
description: Add exactly one command to the meili CLI (for example `stats` or `task cancel`) from its routes in the OpenAPI document, following the naming rules of docs/contract/commands.md and CLAUDE.md, with its snapshot tests, its integration test for a Meilisearch command, manifest and changeset. Use it whenever a command must be added or when someone asks to expose an API route.
argument-hint: <command, for example: stats>
---

# Add the command `meili $ARGUMENTS`

You ship exactly one command in this change: `meili $ARGUMENTS`, with every route of its resource and verb. One file for the command, one test file, one integration test for a Meilisearch command, the regenerated manifest, one changeset line. Nothing else, unless a shared piece of `src/lib/` is missing for this kind of command (say so in the report).

When `$ARGUMENTS` names several commands of the same resource, `document list`, `document view`, `document add`, `document update` and `document delete`, rule 10 of `CLAUDE.md` allows them in one change: run every step below once per command, and ship them complete or not at all. Commands of different resources stay in different changes.

Work through the steps in order. Every check below is enforced by `pnpm test` through `test/contract/`, so a shortcut only moves the failure later.

## 1. Read before you write

- `CLAUDE.md`, fully. The non-negotiable rules are the review checklist.
- `docs/contract/commands.md`: the grammar, the eleven naming rules, the exceptions table, the shared flag groups and the commands without an API.
- `docs/contract/output.md`: output format, pass-through, errors, exit codes, asynchronous operations, destructive commands, input, pagination. The sections that match your routes are the specification of your command.
- `docs/contract/testing.md`: what the three test levels must contain.
- `docs/adr/`: skim the titles, read the ones your change touches. The contract says what the CLI promises; the ADRs say what was already decided, and which alternatives were refused and why. Contradicting one is a new ADR, not a silent change.

Then get the OpenAPI document:

```sh
pnpm openapi   # meilisearch: latest release; management: needs `gh auth login` or GITHUB_TOKEN
```

Do not write a command without the document. If the download fails, stop and tell the user what is missing (network, GitHub token). `pnpm api:coverage` lists every command the rules derive, with its routes and whether it exists: find `meili $ARGUMENTS` there. Its routes are every route whose resource and verb give this command: `index list` covers `GET /indexes`, `stats` covers `GET /stats` and `GET /indexes/{index_uid}/stats`, `document delete` covers three routes. For each route, read in `openapi/meilisearch.json` (or `openapi/management.json`) its path parameters, query parameters, request body and response.

Compare the derived command with `$ARGUMENTS`:

- same name: go on.
- different name because the rules give a wrong, ambiguous or colliding name, or because the user chose a clearer one: record an exception in `ROUTE_EXCEPTIONS` of `src/lib/api-naming.ts` and in the exceptions table of `commands.md`, with the reason, in this same change. The command column of an exception names the command, then the flags that distinguish the route, which the route accepts (`document delete --ids`).
- different name that you think reads better than the derived one: do not choose it yourself. Propose it to the user with the derived name, and follow what they decide. If they choose another name than the derived one, it is an exception with their reason.
- no route in the document, or a parameter the user mentions that the document does not have: stop and ask the user. Do not guess a route and do not read it in Meilisearch's source code.
- a route behind an experimental feature: it is out of the contract (rule 10). Stop and tell the user; opening it is an exception they decide.
- a command that calls no API (`schema`, the `config` commands): it must be in the "Commands without an API" table of `commands.md`; if it is not, stop and ask.

From the routes, write down the flags of each: the path flags (rule 4: `--id` for the resource itself, the singular collection for a parent, `--index`), the query parameters and body fields (rule 6), the identifier flags named by what they identify and their API-spelling aliases (rule 5), and which flag combination selects which route (rule 3).

## 2. Resolve the names

The command id is the file path. `meili task list` gives:

| What | Path |
|---|---|
| command | `src/commands/task/list.ts` |
| unit test | `test/commands/task/list.test.ts` |
| integration test, Meilisearch commands only | `test/integration/meilisearch/task-list.test.ts` |
| snapshot (generated) | `test/commands/task/__snapshots__/list.test.ts.snap` |

The class name is the command id in PascalCase (`TaskList`). The first command of a new resource also needs the topic description in `package.json`, under `oclif.topics.<resource>.description`, otherwise `meili <resource> --help` shows the description of its first command. A command without a resource word (`search`, `export`) or without a verb (`health`, `stats`, `info`) is a file at the root of `src/commands/`. A new collection also needs its singular in `COLLECTIONS` of `src/lib/api-naming.ts`, and a new object whose only command is `view` needs a row in `VIEW_ONLY`.

Find the SDK method in `node_modules/meilisearch/dist/meilisearch.d.ts` or `node_modules/meilisearch/dist/indexes.d.ts`. Prefer the variant that returns the API body unchanged: `getRawIndexes` over `getIndexes`, `getRawIndex` over `getIndex`. If the SDK has no method for a route, stop and ask: ADR 0003 forbids hand-written HTTP. A Management API command calls the generated SDK instead, one function per route in `src/lib/clients/management/generated/sdk.gen.ts`, named after the method and the path (`getApiV2ProjectsById`); run `pnpm gen:management` first if the route is missing there.

## 3. Copy the closest reference

| Kind of command | Reference | Ends with |
|---|---|---|
| read, one route, one result | `src/commands/health.ts` | `await this.output(result)` |
| list route | `src/commands/index/list.ts` | `outputList(...)` |
| unit route | `src/commands/index/view.ts` | `await this.output(result)` |
| write returning a task (the response is a task) | `src/commands/document/add.ts` | `await this.outputTask(task, flags)` |
| write with several routes, one per selector | `src/commands/document/delete.ts` | `await this.outputTask(task, flags)` |
| Management API, list route | `src/commands/project/list.ts` | `outputPage(...)` |
| Management API, write | `src/commands/project/update.ts` | `await this.output(result)` |
| offline (`schema`) | `src/commands/schema.ts` | `await this.output(result)` |

Then fill the class:

- `static api: Api = "meilisearch" | "management" | "none"`. The type annotation is required by strict TypeScript. `BaseCommand` resolves the credentials of that API and builds the client; the command never does.
- `static routes = ["GET /stats", "GET /indexes/{index_uid}/stats"]`: every route of the command, as written in the OpenAPI document. `test/contract/api.test.ts` checks that each exists, that the command name derives from them, that no route of the document is missing, and that each route is reachable by a distinct set of flags.
- `static keyActions = ["stats.get"]`: the key actions the routes require, the specific one of each. Read the `security` of each route in the OpenAPI document, `GET /stats` carries `["stats.get", "stats.*", "*"]`, and keep the first entry, the most specific one. Leave it out when every route declares `security: []` (`GET /health`) and on the Management API, whose document declares no key action. `test/contract/api.test.ts` checks it against the document, so a wrong action fails the tests, it does not reach an agent.
- `static override description`: one sentence, ends with a period. It says what each flag combination does: "Get the statistics of the whole instance, or those of one index with --index."
- `static override examples`: at least one, and one per route. Use `<%= config.bin %> <%= command.id %>`.
- `static override flags`: the path flags first (`index: Flags.string(...)` for a parent, `id: Flags.string(...)` for the resource itself, each with `required: true` only when every route of the command takes it), then the query parameters and body fields in kebab-case of the API name, plus the shared groups. Identifier parameters are `id`, `ids`, `batch-ids`, `index-ids`, `task-ids` by what they identify, with the API spelling as `aliases: ["uids"]`. Flags that call for different routes are `exclusive` of each other (`ids`, `filter`, `all` on `document delete`), so that giving two is a usage error. Reuse the shared groups by spreading them: `BaseCommand.paginationFlags` (`--limit`, `--offset`, `--all`), `BaseCommand.waitFlags` (`--wait`, `--timeout`), `BaseCommand.bodyInputFlags` (`--file`, `--data`), `BaseCommand.confirmFlags` (`--yes`) on every command of the verb `delete`. A route that paginates with `from` (tasks, batches) needs its own group, added to `BaseCommand` with the first such command. Never give a flag a function as `default`: oclif would then load the class to render `--help`.
- Value types (rule 7): `Flags.boolean` for a boolean, `Flags.integer` for an integer, `Flags.string` for a string, a comma-separated `Flags.string` for an array of scalars, a JSON-text `Flags.string` for an object or a nested array. The value `null` sends a JSON null.
- `run()`: `const { flags } = await this.parse(ClassName)`, then one branch per route, selected by the flags (`stats` without `--index` calls `GET /stats`, with it `GET /indexes/{index_uid}/stats`), one call on `this.meilisearch` (a Management API command: one generated SDK function with `{ client: this.managementClient, path, query, body }`) and one of the `output*` calls per branch. For lists, pass the query built from the flags, `{ limit: flags.limit, offset: flags.offset }` (the SDK drops undefined values), and `nextOffsetQuery` from `src/lib/pagination.ts`.
- Errors: do nothing. `BaseCommand.catch` renders API errors as they are. Throw `MeiliCliError` only for CLI-side validation, with a `hint` only when you know the next command to run.
- A command of the verb `delete` spreads `BaseCommand.confirmFlags`, so `--yes` is required: without it oclif fails the parse, `cli_usage`, exit 2, before any network call, and every example of the command carries it. Never a question. A deletion that needs a selector refuses to run without one (`document delete` without `--ids`, `--filter` or `--all` is `cli_usage`).

Never, in a command file: `console.log`, `process.stdout.write`, `this.log`, `fetch`, `process.env`, `new Meilisearch`, `throw new Error`, a `try/catch` that prints. `test/contract/source-rules.test.ts` greps for these.

## 4. Unit test with msw

Copy `test/commands/health.test.ts` (or `test/commands/index/list.test.ts` for a list command). It must contain, each as a snapshot:

1. `--help`: `runCli(["task", "list", "--help"])`, exit 0, empty stderr, stdout snapshot.
2. one success per route: `runCommand(ClassName, [...argv, "--project-url", MEILISEARCH_URL])`, snapshot of `{ stdout, stderr, exitCode }`.
3. one error: an API error body passed through (exit 1, 3 or 4 by status) or a network failure (exit 6).

Add the msw handler for each route in `test/helpers/meilisearch-handlers.ts`, parameterized (status, body, pagination) so that other tests reuse it. Handlers use the fake host `MEILISEARCH_URL`; nothing real goes out, an unhandled request fails the test. A Management API command copies `test/commands/project/list.test.ts` instead: its handlers live in `test/helpers/management-handlers.ts`, follow `openapi/management.json`, and the command runs with `env: managementEnv`, the token and the fake host `MANAGEMENT_URL`.

Run `pnpm test` once to write the snapshots, then read the `.snap` file: the JSON must be the API body unchanged, no wrapper, no added field, no secret.

## 5. Integration test

A Management API command has none: Meilisearch Cloud does not run locally (`docs/contract/testing.md`). For a Meilisearch command, copy `test/integration/meilisearch/health.test.ts` or `index-list.test.ts`. The file starts with `const meilisearchUp = await meilisearchAvailable()` and wraps everything in `describe.skipIf(!meilisearchUp)`. It runs the built binary with `runBinary([...])` against `MEILISEARCH_URL` and `MASTER_KEY` from `setup.ts`, with `--project-url` and `--project-api-key`, never a project of the developer's config file. Fixtures (an index, documents) are created with the SDK under a random suffix and deleted in `afterAll`, so the suite can run in parallel and never depends on existing data. A management command has no integration test (`docs/contract/testing.md`, section 2): its handlers in `test/helpers/management-handlers.ts` follow `openapi/management.json`, and what the document does not say is reported to the user as a documentation gap, never guessed.

## 6. Manifest, changeset

- `pnpm gen:manifest`: builds and rewrites `oclif.manifest.json`. The file is committed; CI fails if it differs from the code. The `meili schema` snapshot in `test/contract/__snapshots__/` changes with it: update it on purpose with `pnpm test -u`, and read the diff.
- Changeset: a new command is visible to users of the package, so it needs a line. Write `.changeset/add-<command-with-dashes>.md` by hand: the interactive `pnpm changeset` cannot be answered by an agent. The line names the command with its required flags; the optional ones live in `--help`:

  ```md
  ---
  "@meilisearch/cli": minor
  ---

  Add `meili stats --index <index>`.
  ```

## 7. Before you finish

```
pnpm lint
pnpm typecheck
pnpm test
```

All three green, no snapshot updated except the ones you created on purpose. A snapshot diff on a command you did not touch is a bug.

Then run the `simplify` skill on your changes, apply what it finds, and rerun the three commands. Read the diff once more with rule 16 of `CLAUDE.md` in hand and delete what does not earn its place: an abstraction used once, an option nobody passes, a branch for a case the API cannot produce, a comment that repeats the code, a test that duplicates another. If you had to add shared code to `src/lib/`, it must be used by this command now, not by a command you imagine.

Then read your diff from the point of view of `docs/`: every exception, variable and code you added appears in the right contract file, or you stop and open a contract change first. Do not edit `src/lib/output.ts`, `src/lib/errors.ts` or `src/lib/config.ts`: they change through a contract pull request only. Do not edit an accepted ADR.

Report to the user: what shipped, which shared pieces you had to add, and the acceptance scenario of the command as a short fish session (the command in the terminal, then piped, then one error case) with the expected exit codes.

## What `test/contract/` checks

So that a red `pnpm test` reads as a message, not as flakiness:

- every API command declares `static routes` and `static keyActions` that match the document, each route exists in the OpenAPI document, the name derives from them, no route of the resource and verb is missing, every flag and alias belongs to a route or to the CLI, and each route is reachable by a distinct set of flags; or a recorded exception says otherwise
- the exceptions table of `commands.md` equals `ROUTE_EXCEPTIONS` in the code, and every exception matches a route of the documents
- a command without API is not named after an API command or resource
- every command class exports `static api` in `meilisearch | management | none`
- every command has a description and an example; every flag has a description, and a flag with a value a `helpValue` or options
- every command in `src/commands/` has its test file in `test/commands/`
- every path, `pnpm` script and `BaseCommand` member the guides cite exists; a path cited before it exists is listed as planned in `test/contract/docs.test.ts`, and the test asks to remove it from the list once it exists
- every command exposes the global flags of `commands.md`; a parent path parameter is a required flag when every route of the command takes it; no command has a positional argument
- the `meili schema` index is a snapshot, and so is one command in full
- a variable that doubles a flag is named `MEILI_` plus the flag name (rule 14)
- no `MEILI_*` literal in `src/` outside the table of `config.md`
- the codes of `errors.ts` are exactly those of `output.md`, with their exit codes
- `--help` opens no connection and documents every environment variable
- `--debug` traces never contain the API key
- only `output.ts` writes to stdout, only `src/lib/clients/` calls `fetch`, nobody throws a bare `Error`
