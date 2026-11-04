# Testing contract

There are three levels. Every command has the first two. Pull request CI runs all three.

## 1. Unit tests, `test/commands/`

There is one test file per command, and the files mirror `src/commands/`. HTTP is mocked with `msw`. Each test file snapshots:

- the `--help` output
- the JSON output for one success case per route the command covers
- the JSON error output and exit code for one error case

Handlers for the Management API live in `test/helpers/management-handlers.ts` and follow `openapi/management.json`. Handlers for the Meilisearch API live in `test/helpers/meilisearch-handlers.ts`.

Commands run in a clean environment. No `MEILI_*` variable is set, except the ones the test sets. `HOME` is a temporary directory. `MEILI_CONFIG` points at a file that does not exist. This way, a developer's own config file never leaks into a test.

A snapshot change is an interface change. It is accepted only when the pull request says so.

Some commands have a path or a date in their output, for example the `auth` commands. Such a command snapshots its `--help` and its errors, and checks the rest field by field: a snapshot of a temporary directory or of an expiry date would change on every run. These commands also need a real server instead of `msw`. `msw` patches `fetch` and cannot follow a redirect to a loopback port.

## 2. Integration tests, `test/integration/`

Integration tests call a real local Meilisearch, with no mock. They run the built binary in the same clean environment as the unit tests. They live in `test/integration/meilisearch/` and run against the instance that the `docker-compose.yml` of this repository starts on `http://localhost:7700`, with the master key `masterKey`.

The Management API has no integration test. Meilisearch Cloud does not run locally. `openapi/management.json` is the source of truth for what the API does: the unit tests mock the API from that document, `test/contract/api.test.ts` checks every declared route against it, and the client is generated from it. When the document does not say something (a required field, a status, an error body), this is a documentation gap. Report it to the Cloud team. The CLI never guesses it.

Integration tests create their own fixtures (an index, documents) with a random suffix, and delete them at the end. They never depend on existing data, so they can run in parallel.

## 3. Contract tests, `test/contract/`

Contract tests are not per command. They protect the promises of `docs/contract/`:

- `meili schema` output is a snapshot of the index and of every command in full, so a renamed command or flag is visible in review
- every command declares `static api`
- every command has a description and at least two examples; every flag has a description, and a flag that takes a value documents it
- every command in `src/commands/` has its test file in `test/commands/`
- exit codes match the table in `output.md` for each `cli_` code
- `--help` never opens a network connection
- redaction removes every secret from `--debug` traces

They also keep code and docs in sync:

- every API command declares `static routes` and `static keyActions` that match the OpenAPI document of its API. Each route exists in the document. The command name derives from the routes by the rules of `commands.md`. Every flag belongs to one of its routes or to the CLI. Each route is reachable by a distinct set of flags. Otherwise, the exception is recorded in `src/lib/api-naming.ts` and in the exceptions table of `commands.md`, and the two must match
- every `MEILI_*` environment variable read in `src/` appears in the table of `docs/contract/config.md`, and every variable in the table is read somewhere
- every error code defined in `src/lib/errors.ts` appears in `docs/contract/output.md`, and every code in that file is defined
- every ADR file has a status line, and a `superseded` ADR names its successor
- every path, `pnpm` script and `BaseCommand` member cited by `CLAUDE.md`, the README, `CONTRIBUTING.md`, the skills or the contracts exists, and every command the README shows is in the manifest. A doc can name a path before it exists: such paths are listed as planned in `test/contract/docs.test.ts`, and the test fails when one of them appears, so the list stays short

These tests parse the Markdown tables. Keep the tables in their current format: one variable, one code or one exception per row, in backticks.

They read the OpenAPI documents in `openapi/`. `pnpm openapi` downloads them, and they are never committed. A missing document makes the tests fail; they are not skipped. CI runs `pnpm openapi` first, with the `MEILI_BOT_GH_PAT` secret for the private management document.

## What runs where

| Suite | Local `pnpm test` | Pull request CI |
|---|---|---|
| Unit | yes | yes |
| Contract | yes | yes |
| Integration Meilisearch | when Meilisearch is up on :7700, skipped otherwise with a visible notice | yes |

A skip is always printed, never silent. A test that passes because the server is absent is a bug.
