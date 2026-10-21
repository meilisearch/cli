# Testing contract

Three levels. Every command has the first two. Pull request CI runs all three.

## 1. Unit tests, `test/commands/`

One test file per command, mirroring `src/commands/`. HTTP is mocked with `msw`. Each test file snapshots:

- the `--help` output
- the JSON output for one success case per route the command covers
- the JSON error output and exit code for one error case

Handlers for the Management API live in `test/helpers/management-handlers.ts` and follow `openapi/management.json`. Handlers for the Meilisearch API live in `test/helpers/meilisearch-handlers.ts`.

Commands run in a scrubbed environment: no `MEILI_*` variable but the ones the test sets, `HOME` in a temporary directory, and `MEILI_CONFIG` pointing at a file that does not exist, so that a developer's own config file never leaks into a test.

A snapshot change is an interface change. It is accepted only when the pull request says so.

A command whose output carries a path or a date, as the `auth` commands do, snapshots its `--help` and its errors and asserts the rest field by field: a snapshot of a temporary directory or of an expiry would change on every run. Those commands also need a real server rather than `msw`, which patches `fetch` and cannot carry a redirect to a loopback port.

## 2. Integration tests, `test/integration/`

They hit real local instances of both APIs, with no mock, through the built binary and the same scrubbed environment as the unit tests.

- `test/integration/meilisearch/`: against Meilisearch, started by the `docker-compose.yml` of this repository on `http://localhost:7700` with the master key `masterKey`.
- `test/integration/management/`: against the Management API from the `meilisearch-cloud` repository. Known facts: it starts with `docker compose up` in that repository; its images are private, so CI needs a registry token to pull them; the seed creates no user and no personal access token, so the test bootstrap must create both before the suite runs (a script in `test/integration/management/bootstrap/`, run once by CI and by `pnpm test:integration`). The base URL, the bootstrap command and the token it produces are documented in `test/integration/management/README.md`, which is the only place where they live. Building this bootstrap is a task of its own, before the first management command.

Integration tests create their own fixtures (an index, a team, a project) with a random suffix and delete them at the end. They never depend on pre-existing data, so they can run in parallel.

## 3. Contract tests, `test/contract/`

Not per command. They protect the promises of `docs/contract/`:

- `meili schema` output is a snapshot, the index and every command in full, so a renamed command or flag is visible in review
- every command declares `static api`
- every command has a description and at least two examples; every flag has a description, and a flag with a value documents it
- every command in `src/commands/` has its test file in `test/commands/`
- exit codes match the table in `output.md` for each `cli_` and `management_` code
- `--help` never opens a network connection
- redaction removes every secret from `--debug` traces

And they keep code and docs in sync:

- every API command declares `static routes` and `static keyActions` that match the OpenAPI document of its API, each route exists in it, the command name derives from them by the rules of `commands.md`, every flag belongs to one of its routes or to the CLI, and each route is reachable by a distinct set of flags; or the exception is recorded in `src/lib/api-naming.ts` and in the exceptions table of `commands.md`, which must match
- every `MEILI_*` environment variable read in `src/` appears in the table of `docs/contract/config.md`, and every variable in the table is read somewhere
- every error code defined in `src/lib/errors.ts` appears in `docs/contract/output.md`, and every code in that file is defined
- every ADR file has a status line, and a `superseded` ADR names its successor
- every path, `pnpm` script and `BaseCommand` member that `CLAUDE.md`, the README, `CONTRIBUTING.md`, the skills and the contracts cite exists, and every command the README shows is in the manifest; paths a doc names before they exist are listed as planned in `test/contract/docs.test.ts`, and the test fails when one of them appears, so that the list stays short

These tests parse the Markdown tables. Keep the tables in the format they have today, one variable, one code or one exception per row, in backticks.

They read the OpenAPI documents in `openapi/`, downloaded by `pnpm openapi` and never committed. A missing document fails the tests instead of skipping them: CI runs `pnpm openapi` first, with the `MEILI_BOT_GH_PAT` secret for the private management document.

## What runs where

| Suite | Local `pnpm test` | Pull request CI |
|---|---|---|
| Unit | yes | yes |
| Contract | yes | yes |
| Integration Meilisearch | when Meilisearch is up on :7700, skipped otherwise with a visible notice | yes |
| Integration management | when the Management API is up locally, skipped otherwise with a visible notice | yes |

Skipped is printed, never silent. A test that passes because the server is absent is a bug.
