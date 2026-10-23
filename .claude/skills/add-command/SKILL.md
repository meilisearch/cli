---
name: add-command
description: Add exactly one command to the meili CLI (for example `get stats` or `cancel tasks`) from its routes in the OpenAPI document, following the naming rules of docs/contract/commands.md and CLAUDE.md, with its snapshot tests, integration test, manifest and changeset. Use it whenever a command must be added or when someone asks to expose an API route.
argument-hint: <command, for example: get stats>
---

# Add the command `meili $ARGUMENTS`

You ship exactly one command in this change: `meili $ARGUMENTS`, with every route of its verb and resource. One file for the command, one test file, one integration test, the regenerated manifest, one changeset line. Nothing else, unless a shared piece of `src/lib/` is missing for this kind of command (say so in the report).

When `$ARGUMENTS` names several commands of the same resource, `get create update delete documents`, rule 10 of `CLAUDE.md` allows them in one change: run every step below once per command, and ship them complete or not at all. Commands of different resources stay in different changes.

Work through the steps in order. Every check below is enforced by `pnpm test` through `test/contract/`, so a shortcut only moves the failure later.

## 1. Read before you write

- `CLAUDE.md`, fully. The non-negotiable rules are the review checklist.
- `docs/contract/commands.md`: the grammar, the eleven naming rules, the exceptions table, the shared flag groups and the commands without an API.
- `docs/contract/output.md`: output modes, pass-through, errors, exit codes, asynchronous operations, destructive commands, input, pagination. The sections that match your routes are the specification of your command.
- `docs/contract/testing.md`: what the three test levels must contain.
- `docs/adr/`: skim the titles, read the ones your change touches. The contract says what the CLI promises; the ADRs say what was already decided, and which alternatives were refused and why. Contradicting one is a new ADR, not a silent change.

Then get the OpenAPI document:

```sh
pnpm openapi   # meilisearch: latest release; management: needs `gh auth login` or MEILI_BOT_GH_PAT
```

Do not write a command without the document. If the download fails, stop and tell the user what is missing (network, GitHub token). `pnpm api:coverage` lists every command the rules derive, with its routes and whether it exists: find `meili $ARGUMENTS` there. Its routes are every route whose verb and resource give this command: `get indexes` covers `GET /indexes` and `GET /indexes/{index_uid}`, `delete documents` covers three routes. For each route, read in `openapi/meilisearch.json` (or `openapi/management.json`) its path parameters, query parameters, request body and response.

Compare the derived command with `$ARGUMENTS`:

- same name: go on.
- different name because the rules give a wrong, ambiguous or colliding name: record an exception in `ROUTE_EXCEPTIONS` of `src/lib/api-naming.ts` and in the exceptions table of `commands.md`, with the reason, in this same change. The command column of an exception names the command, then the flags that distinguish the route, which the route accepts (`delete documents --ids`).
- different name because the user's request contradicts the rules for no such reason: tell the user, propose the derived name, and follow what they decide; if they keep their name, it is an exception with their reason.
- no route in the document, or a parameter the user mentions that the document does not have: stop and ask the user. Do not guess a route and do not read it in Meilisearch's source code.
- a route behind an experimental feature: it is out of the contract (rule 10). Stop and tell the user; opening it is an exception they decide.
- a command that calls no API (`schema`): it must be in the "Commands without an API" table of `commands.md`; if it is not, stop and ask.

From the routes, write down the flags of each: the path flags (rule 4: `--id` for the resource itself, the singular collection for a parent, `--index`), the query parameters and body fields (rule 6), the identifier flags named by what they identify and their API-spelling aliases (rule 5), and which flag combination selects which route (rule 3).

## 2. Resolve the names

The command id is the file path. `meili get stats` gives:

| What | Path |
|---|---|
| command | `src/commands/get/stats.ts` |
| unit test | `test/commands/get/stats.test.ts` |
| integration test | `test/integration/meilisearch/get-stats.test.ts` |
| snapshot (generated) | `test/commands/get/__snapshots__/stats.test.ts.snap` |

The class name is the command id in PascalCase (`GetStats`). The first command of a new verb (`create`, `update`, `delete`, `cancel`, ...) also needs the topic description in `package.json`, under `oclif.topics.<verb>.description`, otherwise `meili --help` does not list the verb. A verb-only command (`search`, `export`) is a file at the root of `src/commands/`.

Find the SDK method in `node_modules/meilisearch/dist/meilisearch.d.ts` or `node_modules/meilisearch/dist/indexes.d.ts`. Prefer the variant that returns the API body unchanged: `getRawIndexes` over `getIndexes`, `getRawIndex` over `getIndex`. If the SDK has no method for a route, stop and ask: ADR 0003 forbids hand-written HTTP.

## 3. Copy the closest reference

| Kind of command | Reference | Ends with |
|---|---|---|
| read, one route, one result | `src/commands/get/health.ts` | `await this.output(result)` |
| read with a list route and a unit route | `src/commands/get/indexes.ts` | `outputList({...})` or `output(...)` by route |
| write returning a task (the response is a task) | `src/commands/create/documents.ts` | `await this.outputTask(task, flags)` |
| write with several routes, one per selector | `src/commands/delete/documents.ts` | `await this.outputTask(task, flags)` |
| offline (`schema`) | `src/commands/schema.ts` | `await this.output(result)` |

Then fill the class:

- `static api: Api = "meilisearch" | "management" | "none"`. The type annotation is required by strict TypeScript. `BaseCommand` resolves the credentials of that API and builds the client; the command never does.
- `static routes = ["GET /indexes", "GET /indexes/{index_uid}"]`: every route of the command, as written in the OpenAPI document. `test/contract/api.test.ts` checks that each exists, that the command name derives from them, that no route of the document is missing, and that each route is reachable by a distinct set of flags.
- `static keyActions = ["indexes.get"]`: the key actions the routes require, the specific one of each. Read the `security` of each route in the OpenAPI document, `GET /indexes` carries `["indexes.get", "indexes.*", "*"]`, and keep the first entry, the most specific one. Leave it out when every route declares `security: []` (`GET /health`) and on the Management API, whose personal access token carries no scope. `test/contract/api.test.ts` checks it against the document, so a wrong action fails the tests, it does not reach an agent.
- `static override description`: one sentence, ends with a period. It says what each flag combination does: "List the indexes of the instance, or get one with --id."
- `static override examples`: at least two, one of them with `--output json`, and one per route. Use `<%= config.bin %> <%= command.id %>`.
- `static override flags`: the path flags first (`index: Flags.string({ required: true, ... })` for a parent, `id: Flags.string(...)` for the resource itself, required only when every route takes it), then the query parameters and body fields in kebab-case of the API name, plus the shared groups. Identifier parameters are `id`, `ids`, `batch-ids`, `index-ids`, `task-ids` by what they identify, with the API spelling as `aliases: ["uids"]`; `id` is an alias of `ids` when the command has no unit route. Flags that call for different routes are `exclusive` of each other (`ids`, `filter`, `all` on `delete documents`), so that giving two is a usage error. Reuse the shared groups by spreading them: `BaseCommand.paginationFlags` (`--limit`, `--offset`, `--all`), `BaseCommand.waitFlags` (`--wait`, `--timeout`), `BaseCommand.bodyInputFlags` (`--file`, `--data`), `BaseCommand.confirmFlags` (`--yes`) on every command of the verb `delete`. A route that paginates with `from` (tasks, batches) needs its own group, added to `BaseCommand` with the first such command. Never give a flag a function as `default`: oclif would then load the class to render `--help`.
- Value types (rule 7): `Flags.boolean` for a boolean, `Flags.integer` for an integer, `Flags.string` for a string, a comma-separated `Flags.string` for an array of scalars, a JSON-text `Flags.string` for an object or a nested array. The value `null` sends a JSON null.
- `run()`: `const { flags } = await this.parse(ClassName)`, then one branch per route, selected by the flags (`if (flags.id !== undefined)`), one call on `this.meilisearch` and one of the `output*` calls per branch. A flag of the list route given with `--id` is simply not sent. For lists, pass the query built from the flags, `{ limit: flags.limit, offset: flags.offset }` (the SDK drops undefined values), and `nextOffsetQuery` from `src/lib/pagination.ts`.
- Errors: do nothing. `BaseCommand.catch` renders API errors as they are. Throw `MeiliCliError` only for CLI-side validation, with a `hint` only when you know the next command to run.
- A command of the verb `delete` spreads `BaseCommand.confirmFlags`, so `--yes` is required: without it oclif fails the parse, `cli_usage`, exit 2, before any network call, and every example of the command carries it. Never a question. A deletion that needs a selector refuses to run without one (`delete documents` without `--ids`, `--filter` or `--all` is `cli_usage`).

Never, in a command file: `console.log`, `process.stdout.write`, `this.log`, `fetch`, `process.env`, `new Meilisearch`, `throw new Error`, a `try/catch` that prints. `test/contract/source-rules.test.ts` greps for these.

## 4. Unit test with msw

Copy `test/commands/get/health.test.ts` (or `test/commands/get/indexes.test.ts` for a command with several routes). It must contain, each as a snapshot:

1. `--help`: `runCli(["get", "stats", "--help"])`, exit 0, empty stderr, stdout snapshot.
2. one success in `--output json` per route: `runCommand(ClassName, [...argv, "--output", "json"], { env: { MEILI_PROJECT_URL: MEILISEARCH_URL } })`, snapshot of `{ stdout, stderr, exitCode }`.
3. one error: an API error body passed through (exit 1, 3 or 4 by status) or a network failure (exit 6).

Add the msw handler for each route in `test/helpers/meilisearch-handlers.ts`, parameterized (status, body, pagination) so that other tests reuse it. Handlers use the fake host `MEILISEARCH_URL`; nothing real goes out, an unhandled request fails the test.

Run `pnpm test` once to write the snapshots, then read the `.snap` file: the JSON must be the API body unchanged, no wrapper, no added field, no secret.

## 5. Integration test

Copy `test/integration/meilisearch/get-health.test.ts` or `get-indexes.test.ts`. The file starts with `const meilisearchUp = await meilisearchAvailable()` and wraps everything in `describe.skipIf(!meilisearchUp)`. It runs the built binary with `runBinary([...])` against `MEILISEARCH_URL` and `MASTER_KEY` from `setup.ts`, never against the shell's `MEILI_PROJECT_URL`. Fixtures (an index, documents) are created with the SDK under a random suffix and deleted in `afterAll`, so the suite can run in parallel and never depends on existing data. A management command needs `test/integration/management/`, whose bootstrap (`docs/contract/testing.md`, section 2) does not exist yet: stop and tell the user it must be built first, in its own change.

## 6. Manifest, changeset

- `pnpm gen:manifest`: builds and rewrites `oclif.manifest.json`. The file is committed; CI fails if it differs from the code. The `meili schema` snapshot in `test/contract/__snapshots__/` changes with it: update it on purpose with `pnpm test -u`, and read the diff.
- Changeset: a new command is visible to users of the package, so it needs a line. Until the first release there is a single changeset, `.changeset/first-version.md`: add your command to its first bullet. After the first release, write `.changeset/add-<command-with-dashes>.md` by hand, the interactive `pnpm changeset` cannot be answered by an agent. The line names the command with its required flags; the optional ones live in `--help`:

  ```md
  ---
  "@meilisearch/cli": minor
  ---

  Add `meili get stats --index <index>`.
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

- every API command declares `static routes` and `static keyActions` that match the document, each route exists in the OpenAPI document, the name derives from them, no route of the verb and resource is missing, every flag and alias belongs to a route or to the CLI, and each route is reachable by a distinct set of flags; or a recorded exception says otherwise
- the exceptions table of `commands.md` equals `ROUTE_EXCEPTIONS` in the code, and every exception matches a route of the documents
- a command without API is not named after an API command or verb
- every command class exports `static api` in `meilisearch | management | none`
- every command has a description and two examples, one with `--output json`; every flag has a description, and a flag with a value a `helpValue` or options
- every command in `src/commands/` has its test file in `test/commands/`
- every path, `pnpm` script and `BaseCommand` member the guides cite exists; a path cited before it exists is listed as planned in `test/contract/docs.test.ts`, and the test asks to remove it from the list once it exists
- every command exposes the global flags of `commands.md`; a parent path parameter is a required flag; no command has a positional argument
- the `meili schema` index is a snapshot, and so is one command in full
- a variable that doubles a flag is named `MEILI_` plus the flag name (rule 14)
- no `MEILI_*` literal in `src/` outside the table of `config.md`
- the codes of `errors.ts` are exactly those of `output.md`, with their exit codes
- `--help` opens no connection and documents every environment variable
- `--debug` traces never contain the API key
- only `output.ts` writes to stdout, only `src/lib/clients/` calls `fetch`, nobody throws a bare `Error`
