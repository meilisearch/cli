# Testing contract

Three levels. Every command has the first two. Pull request CI runs all three.

## 1. Unit tests, `test/commands/`

One test file per command, mirroring `src/commands/`. HTTP is mocked with `msw`. Each test file snapshots:

- the `--help` output
- the JSON output for one success case
- the JSON error output and exit code for one error case

Handlers for the management API live in `test/helpers/management-handlers.ts` and follow `openapi/management.yaml`. Handlers for the engine API live in `test/helpers/engine-handlers.ts`.

A snapshot change is an interface change. It is accepted only when the pull request says so.

## 2. Integration tests, `test/integration/`

They hit real local instances of both APIs, with no mock.

- `test/integration/engine/`: against Meilisearch, started by the `docker-compose.yml` of this repository on `http://localhost:7700` with the master key `masterKey`.
- `test/integration/management/`: against the management API from the `meilisearch-cloud` repository. Known facts: it starts with `docker compose up` in that repository; its images are private, so CI needs a registry token to pull them; the seed creates no user and no personal access token, so the test bootstrap must create both before the suite runs (a script in `test/integration/management/bootstrap/`, run once by CI and by `pnpm test:integration`). The base URL, the bootstrap command and the token it produces are documented in `test/integration/management/README.md`, which is the only place where they live. Building this bootstrap is a task of its own, before the first management command.

Integration tests create their own fixtures (an index, a team, a project) with a random suffix and delete them at the end. They never depend on pre-existing data, so they can run in parallel.

## 3. Contract tests, `test/contract/`

Not per command. They protect the promises of `docs/contract/`:

- `meili schema` output is a snapshot, so a renamed command or flag is visible in review
- every command declares `static api`
- every command has a description and at least two examples
- exit codes match the table in `output.md` for each `cli_` and `management_` code
- `--help` never opens a network connection
- redaction removes every secret from `--debug` traces

And they keep code and docs in sync:

- every command in `oclif.manifest.json` appears in `docs/contract/commands.md`, and every `meili ...` command in that file exists in the manifest
- every `MEILI_*` environment variable read in `src/` appears in the table of `docs/contract/config.md`, and every variable in the table is read somewhere
- every error code defined in `src/lib/errors.ts` appears in `docs/contract/output.md`, and every code in that file is defined
- every ADR file has a status line, and a `superseded` ADR names its successor

These tests parse the Markdown tables. Keep the tables in the format they have today, one command or one variable per row, in backticks.

## What runs where

| Suite | Local `pnpm test` | Pull request CI | Nightly |
|---|---|---|---|
| Unit | yes | yes | yes |
| Contract | yes | yes | yes |
| Integration engine | when Meilisearch is up on :7700, skipped otherwise with a visible notice | yes | yes |
| Integration management | when the management API is up locally, skipped otherwise with a visible notice | yes | yes |

Skipped is printed, never silent. A test that passes because the server is absent is a bug.
