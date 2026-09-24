# meili, the Meilisearch CLI

This file is the maintainer guide for humans and for coding agents. Read it fully before you change anything. The detailed contracts live in `docs/contract/`. The reasons behind the decisions live in `docs/adr/`. When this file and a contract file disagree, the contract file wins.

## What this project is

`meili` is a command line tool that talks to two APIs:

- the Meilisearch API (indexes, documents, search, settings, tasks, keys) on any instance, local or remote
- the Management API, which manages Meilisearch Cloud (organizations, teams, projects, resources, regions)

`meili` is built for coding agents only. Every design choice favors the agent: no interaction, structured output, stable errors, self-description. Human comfort features are out of scope.

Package: `@meilisearch/cli` on npm. Binary: `meili`.

## Non-negotiable rules

1. Data goes to stdout. Everything else (logs, progress, warnings, debug) goes to stderr. Never print a message like "Done" on stdout.
2. Only `src/lib/output.ts` writes to stdout. Commands never call `console.log`, `process.stdout.write` or `this.log` directly.
3. Only the generated Management API client and `meilisearch-js` make HTTP calls. Never write `fetch` in a command.
4. Never prompt and never ask for confirmation. A destructive command, `delete`, `cancel` or `swap`, runs as written.
5. Never open `$EDITOR`. Every input comes from a flag, an environment variable, a file (`--file`) or stdin (`--file -`).
6. Command and flag names derive from the API routes by the rules of `docs/contract/commands.md`: verb first, resource plural, `meili get indexes --id movies`. The resource's own identifier is `--id`, or `--ids` when the list route filters by identifiers; a parent in the path is a flag named after its collection, `--index`; a query or body parameter keeps its API name in kebab-case, `primaryKey` is `--primary-key`. No positional argument, and no synonym beyond the aliases the contract lists.
7. Errors are structured. Use `MeiliCliError` from `src/lib/errors.ts` with a code and an exit code from the table in `docs/contract/output.md`. Never `throw new Error("...")`.
8. Secrets never appear in output, logs or debug traces. Use the redaction helpers in `src/lib/config.ts`.
9. No new dependency without a one line justification in the pull request. Prefer the standard library.
10. One command per pull request. One file per command, covering every route of its verb and resource. Every command has a snapshot test.
11. Every command declares the API it uses with `static api = "meilisearch" | "management" | "none"`. `BaseCommand` resolves credentials and builds the client. Never resolve credentials or build a client in a command.
12. Code and docs change together. If your change touches a command name, a flag, an environment variable, an error code, an exit code or a file path that appears in `docs/`, update that doc in the same pull request. The contract tests in `test/contract/` fail on most of these drifts, so a red `pnpm test` after a docs-free change is expected, not a flaky test.
13. Never edit an accepted ADR to match the code. If your change contradicts an ADR, stop and ask, or write a new ADR that supersedes the old one and mark the old one `superseded by ADR NNNN`. The history of decisions stays readable.
14. A setting that exists both as a flag and as an environment variable carries the same name: the variable is `MEILI_` followed by the flag name in upper snake case. `--project-url` is `MEILI_PROJECT_URL`, `--output` is `MEILI_OUTPUT`. Not every variable needs a flag, but a pair never drifts. `test/contract/env.test.ts` checks it.
15. `.github/PULL_REQUEST_TEMPLATE.md` is the definition of done. Before you open a pull request, or say that you are done, go through every box of the template and tick it only if it is true. A box you cannot tick is work left to do, or a reason to say so in the pull request, never a box to skip.
16. The simplest code that passes the tests wins. Before you say you are done, read your diff once more and delete what does not earn its place: an abstraction used once, a parameter or option nobody passes, a branch for a case the API cannot produce, a guard against a caller that does not exist, a comment that repeats the code, a helper the standard library already provides, a test that checks the same thing as another. A command file reads top to bottom; what it needs beyond its own route goes to `src/lib/`, once, and is named in the pull request. When two designs pass the same tests, ship the one with fewer moving parts, even if the other is more general.

## Stack

- TypeScript, strict mode, `noUncheckedIndexedAccess` on. Node 22 or newer.
- oclif v5 (`@oclif/core` 5) for the command tree, topic separator is a space (`meili get indexes`). See ADR 0001.
- `meilisearch-js` for the Meilisearch API.
- `@hey-api/openapi-ts` generates the Management API client from `openapi/management.json`, downloaded by `pnpm openapi:management` and never committed, into `src/lib/clients/management/generated/`. Never edit generated files. Run `pnpm gen:management` to refresh them (the generator and the script arrive with the first management command). In code, commands, flags and environment variables, `management` is the name for everything that touches the Management API. `Cloud` only appears in prose, as the product name.
- vitest for tests, with snapshots. `msw` mocks HTTP in unit tests. Integration tests run against a local Meilisearch and a local Management API, see `docs/contract/testing.md`.
- Biome for lint and format.
- changesets for versioning and the changelog.
- pnpm as the package manager.

## Repository conventions

Explore the tree yourself. These are the rules that are not visible from the tree:

- `src/commands/` holds one file per command. The file path is the command path: `src/commands/get/projects.ts` is `meili get projects`. oclif derives the command tree from it, so moving a file renames a command.
- `src/lib/output.ts`, `src/lib/errors.ts` and `src/lib/config.ts` implement the contract in `docs/contract/`. They change only through a contract pull request.
- `src/lib/clients/management/generated/` is generated from `openapi/management.json`. Never edit it.
- `test/commands/` mirrors `src/commands/`, one test file per command.
- `docs/contract/` is what the CLI promises. `docs/adr/` is why. `.claude/skills/` holds the procedures agents follow.

## How to add a command

Use the skill: `/add-command <command>`, for example `/add-command get stats`. If the skill is not available yet, follow these steps by hand.

1. Run `pnpm openapi`. Find every route of the verb and resource in `openapi/meilisearch.json` or `openapi/management.json` and derive the command name, its routes and its flags with the naming rules of `docs/contract/commands.md`. If the document does not describe what you need, stop and ask. If the derived name is wrong for a route, record an exception in `src/lib/api-naming.ts` and in the exceptions table of `commands.md`, with the reason, in the same pull request. A command that calls no API is listed in `commands.md`; if it is not, stop and ask.
2. Copy the closest existing command file. `src/commands/get/health.ts` is the reference for a read command with one route, `src/commands/get/indexes.ts` for a command that covers a list route and a unit route. For a write command that returns a task, start from `health.ts` and end with `outputTask`.
3. Fill `description`, `examples` (at least two, one of them with `--output json`), `routes` and `flags`. Reuse the shared flags from `BaseCommand` (`waitFlags`, `paginationFlags`, `bodyInputFlags`).
4. Call the client. Read commands end with `await this.output(result)`. Write commands end with `await this.outputTask(task, flags)`.
5. Map errors. Do nothing for API errors, `BaseCommand` maps them. Add a `hint` only when you know the next command the user should run.
6. Create `test/commands/<same path>.test.ts` from the sibling test. It must snapshot the `--help` output and the JSON output for one success case and one error case, with `msw` mocks.
7. Add one integration test in `test/integration/meilisearch/` or `test/integration/management/`. Meilisearch runs locally from the `docker compose` file of this repository. The Management API needs the bootstrap described in `docs/contract/testing.md`, which does not exist yet: build it in its own pull request before the first management command. Unit tests still mock HTTP with `msw`; integration tests hit the real thing.
8. Run `pnpm gen:manifest` so `oclif.manifest.json` and `meili schema` know the command.
9. Add the command to the changeset. Until the first release, `.changeset/first-version.md` is the only one and describes everything: add your line to it. After it, write a new file in `.changeset/` by hand with type `minor`: `pnpm changeset` is interactive.
10. Run the "Before you finish" list.

## Before you finish

Run these commands and fix every failure before you open a pull request or say you are done:

```
pnpm lint
pnpm typecheck
pnpm test
```

Update snapshots (`pnpm test -u`) only when you changed the interface on purpose. A snapshot diff on a command you did not touch is a bug, not something to accept.

Then read the diff of your pull request twice. Once for simplicity: in Claude Code, run the `simplify` skill on your changes and rerun the three commands above after it; in any agent, apply rule 16 by hand and delete every line that does not earn its place. Once from the point of view of `docs/`: does every name, flag, variable and code you added or renamed appear in the right contract file? The contract tests catch the mechanical part. The meaning is on you: a new behavior that `docs/contract/` does not describe is a contract change and needs its own pull request first. Finally, go through `.github/PULL_REQUEST_TEMPLATE.md` box by box (rule 15).

## What not to do

- Do not add a command or flag that the OpenAPI document does not describe and the naming rules do not derive, unless it is a recorded exception. A new global flag, output field, environment variable or error code is a contract change first, in its own pull request.
- Do not add "human friendly" text to the JSON output. There is no human mode: a human reads the indented JSON.
- Do not wrap API responses. Return the API body as it is. See `docs/contract/output.md`.
- Do not catch errors to print them yourself. Let `BaseCommand` render them.
- Do not add interactive features (menus, TUI, spinners on stdout). A spinner on stderr when stderr is a TTY is fine.
- Do not change `src/lib/output.ts`, `src/lib/errors.ts` or `src/lib/config.ts` in a command pull request. These files carry the contract and change through their own pull request.
- Do not touch `src/lib/clients/management/generated/`. Fix the OpenAPI spec or the generator config instead.
- Do not edit an accepted ADR. Write a new one.

## Where to read more

- `docs/contract/commands.md`: the naming rules that turn an API route into a command, the exceptions, the global and shared flags, the commands without an API
- `docs/contract/output.md`: output modes, error format, exit codes, async tasks, pagination
- `docs/contract/config.md`: connection resolution, environment variables, secrets
- `openapi/`: the OpenAPI documents downloaded by `pnpm openapi`, the reference for every command name
- `docs/contract/testing.md`: test levels, how the two local APIs start, what runs in pull request CI
- `docs/adr/`: the decisions and the reasons
