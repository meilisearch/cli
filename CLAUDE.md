# meili, the Meilisearch CLI

This file is the maintainer guide for humans and for coding agents. Read it fully before you change anything. The detailed contracts live in `docs/contract/`. The reasons behind the decisions live in `docs/adr/`. When this file and a contract file disagree, the contract file wins.

## What this project is

`meili` is a command line tool that talks to two APIs:

- the Meilisearch engine API (indexes, documents, search, settings, tasks, keys) on any instance, local or remote
- the Meilisearch management API, which manages Meilisearch Cloud (organizations, teams, projects, resources, regions)

`meili` is built for coding agents only. Every design choice favors the agent: no interaction, structured output, stable errors, self-description. Human comfort features are out of scope.

Package: `@meilisearch/cli` on npm. Binary: `meili`.

## Non-negotiable rules

1. Data goes to stdout. Everything else (logs, progress, warnings, debug) goes to stderr. Never print a message like "Done" on stdout.
2. Only `src/lib/output.ts` writes to stdout. Commands never call `console.log`, `process.stdout.write` or `this.log` directly.
3. Only the generated management API client and `meilisearch-js` make HTTP calls. Never write `fetch` in a command.
4. Never prompt when stdin is not a TTY. Destructive commands require `--yes` in that case and exit with code 7 without it.
5. Never open `$EDITOR`. Every input comes from a flag, an environment variable, a file (`--file`) or stdin (`--file -`).
6. Command and flag names follow the API names. Do not invent synonyms. `indexUid` in the API is `<index>` as an argument and `--index-uid` as a flag.
7. Errors are structured. Use `MeiliCliError` from `src/lib/errors.ts` with a code and an exit code from the table in `docs/contract/output.md`. Never `throw new Error("...")`.
8. Secrets never appear in output, logs or debug traces. Use the redaction helpers in `src/lib/config.ts`.
9. No new dependency without a one line justification in the pull request. Prefer the standard library.
10. One command per pull request. One file per command. Every command has a snapshot test.
11. Every command declares the API it uses with `static api = "engine" | "management" | "none"`. `BaseCommand` resolves credentials and builds the client. Never resolve credentials or build a client in a command.
12. Code and docs change together. If your change touches a command name, an argument, a flag, an environment variable, an error code, an exit code or a file path that appears in `docs/`, update that doc in the same pull request. The contract tests in `test/contract/` fail on most of these drifts, so a red `pnpm test` after a docs-free change is expected, not a flaky test.
13. Never edit an accepted ADR to match the code. If your change contradicts an ADR, stop and ask, or write a new ADR that supersedes the old one and mark the old one `superseded by ADR NNNN`. The history of decisions stays readable.

## Stack

- TypeScript, strict mode, `noUncheckedIndexedAccess` on. Node 22 or newer.
- oclif v5 (`@oclif/core` 5) for the command tree, topic separator is a space (`meili index list`). See ADR 0005.
- `meilisearch-js` for the engine API.
- `@hey-api/openapi-ts` generates the management API client from the spec committed at `openapi/management.yaml` into `src/lib/clients/management/generated/`. Never edit generated files. Run `pnpm gen:management` to refresh them. In code, commands, flags and environment variables, `management` is the name for everything that touches the management API. `Cloud` only appears in prose, as the product name.
- vitest for tests, with snapshots. `msw` mocks HTTP in unit tests. Integration tests run against a local Meilisearch and a local management API, see `docs/contract/testing.md`.
- Biome for lint and format.
- changesets for versioning and the changelog.
- pnpm as the package manager.

## Repository conventions

Explore the tree yourself. These are the rules that are not visible from the tree:

- `src/commands/` holds one file per command. The file path is the command path: `src/commands/management/project/list.ts` is `meili management project list`. oclif derives the command tree from it, so moving a file renames a command.
- `src/lib/output.ts`, `src/lib/errors.ts` and `src/lib/config.ts` implement the contract in `docs/contract/`. They change only through a contract pull request.
- `src/lib/clients/management/generated/` is generated from `openapi/management.yaml`. Never edit it.
- `test/commands/` mirrors `src/commands/`, one test file per command.
- `docs/contract/` is what the CLI promises. `docs/adr/` is why. `.claude/skills/` holds the procedures agents follow.

## How to add a command

Use the skill: `/add-command <command path>`, for example `/add-command index stats`. If the skill is not available yet, follow these steps by hand.

1. Read `docs/contract/commands.md` and find the command. If it is not there, stop and ask. Do not add commands that are not in the contract.
2. Copy the closest existing command file. `src/commands/index/get.ts` is the reference for a read command. `src/commands/index/create.ts` is the reference for a write command that returns a task.
3. Fill `description`, `examples` (at least two, one of them with `--output json`), `args` and `flags`. Reuse the shared flags from `BaseCommand` (`waitFlags`, `paginationFlags`, `bodyInputFlags`).
4. Call the client. Read commands end with `await this.output(result)`. Write commands end with `await this.outputTask(task, flags)`.
5. Map errors. Do nothing for API errors, `BaseCommand` maps them. Add a `hint` only when you know the next command the user should run.
6. Create `test/commands/<same path>.test.ts` from the sibling test. It must snapshot the `--help` output and the JSON output for one success case and one error case, with `msw` mocks.
7. Add one integration test in `test/integration/engine/` or `test/integration/management/`. Both APIs run locally: Meilisearch from the `docker compose` file of this repository, the management API from the `meilisearch-cloud` repository (see `docs/contract/testing.md` for how CI starts it and which seeded token it uses). Unit tests still mock HTTP with `msw`; integration tests hit the real thing.
8. Run `pnpm gen:manifest` so `oclif.manifest.json` and `meili schema` know the command.
9. Add a changeset: `pnpm changeset` with type `minor` for a new command.
10. Run the "Before you finish" list.

## Before you finish

Run these commands and fix every failure before you open a pull request or say you are done:

```
pnpm lint
pnpm typecheck
pnpm test
```

Update snapshots (`pnpm test -u`) only when you changed the interface on purpose. A snapshot diff on a command you did not touch is a bug, not something to accept.

Then read the diff of your pull request once, from the point of view of `docs/`: does every name, flag, variable and code you added or renamed appear in the right contract file? The contract tests catch the mechanical part. The meaning is on you: a new behavior that `docs/contract/` does not describe is a contract change and needs its own pull request first.

## What not to do

- Do not add a command, flag or output field that is not in `docs/contract/`. Propose the change in the contract first, in its own pull request.
- Do not add "human friendly" text to the JSON output. The table output is for humans.
- Do not wrap API responses. Return the API body as it is. See `docs/contract/output.md`.
- Do not catch errors to print them yourself. Let `BaseCommand` render them.
- Do not add interactive features (menus, TUI, spinners on stdout). A spinner on stderr when stderr is a TTY is fine.
- Do not change `src/lib/output.ts`, `src/lib/errors.ts` or `src/lib/config.ts` in a command pull request. These files carry the contract and change through their own pull request.
- Do not touch `src/lib/clients/management/generated/`. Fix the OpenAPI spec or the generator config instead.
- Do not edit an accepted ADR. Write a new one.

## Where to read more

- `docs/contract/commands.md`: the full command tree, with the API route behind each command
- `docs/contract/output.md`: output modes, error format, exit codes, async tasks, pagination
- `docs/contract/config.md`: connection resolution, environment variables, config file, secrets
- `openapi/management.yaml`: the management API spec, source of the generated client
- `docs/contract/testing.md`: test levels, how the two local APIs start, what runs in pull request CI
- `docs/adr/`: the decisions and the reasons
