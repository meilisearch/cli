# meili, the Meilisearch CLI

This file is the maintainer guide for humans and for coding agents. Read it fully before you change anything. The detailed contracts are in `docs/contract/`. The reasons for the decisions are in `docs/adr/`. When this file and a contract file disagree, the contract file wins.

## What this project is

`meili` is a command line tool that talks to two APIs:

- the Meilisearch API (indexes, documents, search, settings, tasks, keys) on any instance, local or remote
- the Management API, which manages Meilisearch Cloud (organizations, teams, projects, resources, regions)

`meili` must always work well for coding agents. This means no interaction, structured output, stable errors and self-description. Comfort for humans also matters. From the start, it comes from the documentation and the `--help`. Later, it will also come from comfort commands. These commands never change how the rest of the CLI behaves.

Package: `@meilisearch/cli` on npm. Binary: `meili`.

## Non-negotiable rules

1. Data goes to stdout. Everything else (logs, progress, warnings, debug) goes to stderr. Never print a message like "Done" on stdout.
2. Only `src/lib/output.ts` writes to stdout. Commands never call `console.log`, `process.stdout.write` or `this.log` directly.
3. Only `src/lib/clients/` makes HTTP calls: the generated Management API client, `meilisearch-js`, the OAuth client of `meili auth login`, and the region ping of `meili teleport`. Never write `fetch` in a command.
4. Never prompt and never ask a question. Every command runs as written. Interactive commands, such as `meili teleport`, are for humans: an agent never runs them, and they refuse to run without a terminal (ADR 0015). A command of the verb `delete` requires `--yes` on the command line before it runs. This flag comes from the shared group `BaseCommand.confirmFlags`. See ADR 0007.
5. Never open `$EDITOR`. Every input comes from a flag, an environment variable, a file (`--file`), stdin (`--file -`) or the config file of `docs/contract/config.md`. The CLI deduces nothing from the config file: it uses only what the file states.
6. Command and flag names come from the API routes, by the rules of `docs/contract/commands.md`. These rules give the default name. The maintainers may choose another command name case by case, recorded as an exception (ADR 0018). An agent uses the derived name, and proposes another one to a human, who decides. The resource comes first, in the singular, then the verb: `meili index view --id movies`. A resource that is one object, not a collection, keeps its API name: `settings`, `stats`, `health`. The flag for the resource's own identifier is `--id`, or `--ids` when the list route filters by identifiers. A parent in the path becomes a flag named after its collection: `--index`. A query or body parameter keeps its API name in kebab-case: `primaryKey` becomes `--primary-key`. There are no positional arguments, and no synonyms other than the aliases that the contract lists.
7. Errors are structured. Use `MeiliCliError` from `src/lib/errors.ts` with a code and an exit code from the table in `docs/contract/output.md`. Never `throw new Error("...")`.
8. The credentials that the CLI uses to reach an API never appear in output, logs or debug traces. Use the redaction helpers in `src/lib/config.ts`. A credential that an API returns is data. It goes to stdout unchanged, like the `key` of `key list`. The only exception is the `masterKey` of `project add`, which is masked (ADR 0013). See the Secrets section of `docs/contract/config.md`.
9. No new dependency without a one-line justification in the pull request. Prefer the standard library.
10. One command per pull request. The exception is the commands of one resource, when they ship together as a complete set: the `list`, `view`, `add`, `update` and `delete` of `document` are one change. Each command has one file, which covers every route of its resource and verb. Every command has a snapshot test.
11. Every command declares the API it uses with `static api = "meilisearch" | "management" | "none"`. `BaseCommand` resolves credentials and builds the client. Never resolve credentials or build a client in a command.
12. Code and docs change together. If your change touches a command name, a flag, an environment variable, an error code, an exit code or a file path that appears in `docs/`, update that doc in the same pull request. The contract tests in `test/contract/` fail on most of these mismatches. So if you change the code without the docs and `pnpm test` fails, this is expected. It is not a flaky test.
13. Never edit an accepted ADR to match the code. If your change contradicts an ADR, stop and ask. Or write a new ADR that supersedes the old one, and mark the old one `superseded by ADR NNNN`. This keeps the history of decisions readable.
14. A setting that exists both as a flag and as an environment variable has the same name in both. The variable is `MEILI_` followed by the flag name in upper snake case: `--timeout` is `MEILI_TIMEOUT`. Not every variable needs a flag. But when both exist, their names always match. `test/contract/env.test.ts` checks it.
15. `.github/PULL_REQUEST_TEMPLATE.md` is the definition of done. Before you open a pull request, or say that you are done, go through every box of the template. Tick a box only if it is true. A box that you cannot tick is work left to do, or something to explain in the pull request. Never skip a box.
16. The simplest code that passes the tests wins. Before you say you are done, read your diff once more. Delete everything that is not needed: an abstraction used once, a parameter or option that nobody passes, a branch for a case that the API cannot produce, a guard against a caller that does not exist, a comment that repeats the code, a helper that the standard library already provides, a test that checks the same thing as another test. A command file reads from top to bottom. Anything it needs beyond its own route goes to `src/lib/`, once, and the pull request names it. When two designs pass the same tests, ship the one with fewer parts, even if the other is more general.
17. Docs use international, simplified technical English. Readers are not always native English speakers. This applies to every Markdown file of the repository, the ADRs included.
    - **Plain.** Short sentences, everyday words, no idioms.
    - **Clear over elegant.** Choose the sentence a reader understands on the first read.
    - **Tight.** A sentence stays only if removing it loses information.
18. Everything the user types sends usage analytics to PostHog (ADR 0016, ADR 0019, ADR 0020, ADR 0021). This covers each command line, and each answer in an interactive command such as `meili teleport`.
    - **A command line.** `BaseCommand` sends `cli_command_run` when the command ends. So every command extends `BaseCommand` and exits through it: `this.exit`, or `this.exitNow` from a signal handler, never `process.exit`. A command line that runs no command sends its own event from `bin/run.js`: `cli_help_shown` for a help (ADR 0020), `cli_command_not_found` for an unknown command. `--version` runs the `version` command, so it sends `cli_command_run` (ADR 0021).
    - **An answer.** Ask only with `choose`, `ask` and `askSecret` of `src/lib/terminal.ts`. They send `cli_prompt_answered` and `cli_prompt_aborted`. Give every new question a new, stable `prompt` id, and every option of `choose` a stable `id`. An option that is the user's own data, such as a team, has no `id`: the event then has no `choice`. A renamed id breaks the funnels in PostHog.
    - **Never a value.** No flag value, free text, name, URL, key or document. Only names and fixed ids.
    - **A new event or property is a contract change.** It goes in the "Analytics" section of `docs/contract/config.md`, with a new ADR.

## Stack

- TypeScript, strict mode, `noUncheckedIndexedAccess` on. Node 22 or newer.
- oclif v5 (`@oclif/core` 5) for the command tree. The topic separator is a space (`meili index list`). See ADR 0001.
- `meilisearch-js` for the Meilisearch API.
- `@hey-api/openapi-ts` generates the Management API client into `src/lib/clients/management/generated/`, from `openapi/management.json`. `pnpm openapi:management` downloads this document, which is never committed. Never edit generated files. Run `pnpm gen:management` to refresh them. This script runs the generator through `pnpm dlx`, with the config of `openapi-ts.config.mjs`. It also installs TypeScript 5 next to the generator, because the generator needs it. CI fails when the committed files differ. In code, flags and environment variables, `management` names the Management API itself, as in `MEILI_MANAGEMENT_URL`. `cloud` names the product, Meilisearch Cloud, when a command, a flag or a field refers to it: `config sync-with-cloud`, `--sync-with-cloud`, `cloud.id`.
- vitest for tests, with snapshots. `msw` mocks HTTP in unit tests. Integration tests run against a local Meilisearch. The Management API has no local instance, see `docs/contract/testing.md`.
- Biome for lint and format.
- changesets for versioning and the changelog.
- pnpm as the package manager.

## Repository conventions

Explore the tree yourself. The rules below are not visible from the tree:

- `src/commands/` holds one file per command. The file path is the command path: `src/commands/project/list.ts` is `meili project list`. oclif builds the command tree from these paths, so moving a file renames a command.
- `src/lib/output.ts`, `src/lib/errors.ts` and `src/lib/config.ts` implement the contract in `docs/contract/`. They change only in a contract pull request.
- `src/lib/clients/management/generated/` is generated from `openapi/management.json`. Never edit it.
- `test/commands/` mirrors `src/commands/`, one test file per command.
- `docs/contract/` is what the CLI promises. `docs/adr/` is why. `.claude/skills/` holds the procedures agents follow.

## How to add a command

Use the skill: `/add-command <command>`, for example `/add-command stats`. If the skill is not available yet, follow these steps by hand.

1. Run `pnpm openapi`. Find every route of the resource and verb in `openapi/meilisearch.json` or `openapi/management.json`. Derive the command name, its routes and its flags with the naming rules of `docs/contract/commands.md`. If the document does not describe what you need, stop and ask. If the derived name is wrong for a route, or the human chose another one, record an exception in `src/lib/api-naming.ts` and in the exceptions table of `commands.md`, with the reason, in the same pull request. A command that calls no API is listed in `commands.md`. If it is not, stop and ask. Read the ADRs related to what you are about to change. `docs/adr/` is small. Each file says what was decided and what was refused. If you contradict a decision, you need a new ADR, not a silent change (rule 13). If you find this out at the end, you must rewrite your work.
2. Copy the closest existing command file. `src/commands/health.ts` is the reference for a read command with one route. `src/commands/index/list.ts` is the reference for a list command, and `src/commands/index/view.ts` for a command that reads one item. For a write command that returns a task, start from `health.ts` and end with `outputTask`.
3. Fill `description`, `examples` (at least one), `routes`, `keyActions` (the specific action of each route's `security` in the OpenAPI document, empty when there is none) and `flags`. Reuse the shared flags from `BaseCommand` (`waitFlags`, `paginationFlags`, `bodyInputFlags`).
4. Call the client. `view` commands end with `await this.output(result)`, and `list` commands with `await this.outputList(...)`. Write commands end with `await this.outputTask(task, flags)`. In a terminal, `BaseCommand` prints these results as text for a human: a table, every attribute, or the task (ADR 0023). A command may pass its own text as the last argument, built with `src/lib/human.ts`. Test that text with `tty: true`.
5. Map errors. Do nothing for API errors: `BaseCommand` maps them. Add a `hint` only when you know the next command the user should run.
6. Create `test/commands/<same path>.test.ts` from the sibling test. It must snapshot the `--help` output and the JSON output for one success case and one error case, with `msw` mocks.
7. For a Meilisearch command, add one integration test in `test/integration/meilisearch/`. Meilisearch runs locally from the `docker compose` file of this repository. A management command has no integration test. Meilisearch Cloud does not run locally. Its OpenAPI document is the source of truth, and the unit tests mock the API from that document (`docs/contract/testing.md`). If the document does not describe something, report the gap to the Cloud team. Do not guess.
8. Run `pnpm gen:manifest` so `oclif.manifest.json` and `meili schema` know the command.
9. Add a changeset of type `minor`, by the rules of `.changeset/README.md`.
10. Run the "Before you finish" list.

## Changesets

Every pull request that changes the CLI for its users adds a changeset. Read `.changeset/README.md` before you write one.

## Before you finish

Run these commands and fix every failure before you open a pull request or say you are done:

```
pnpm lint
pnpm typecheck
pnpm test
```

Update snapshots (`pnpm test -u`) only when you changed the interface on purpose. A snapshot diff on a command you did not touch is a bug, not something to accept.

Then read the diff of your pull request twice. First, read it for simplicity. In Claude Code, run the `simplify` skill on your changes, then run the three commands above again. In any other agent, apply rule 16 by hand and delete every line that is not needed. Second, read it from the point of view of `docs/`. Does every name, flag, variable and code that you added or renamed appear in the right contract file? The contract tests check the mechanical part. You are responsible for the meaning. A new behavior that `docs/contract/` does not describe is a contract change, so the contract file and the code change in the same pull request (rule 12). Finally, go through `.github/PULL_REQUEST_TEMPLATE.md` box by box (rule 15).

## What not to do

- Do not add a command or flag that the OpenAPI document does not describe and the naming rules do not derive, unless it is a recorded exception. A new global flag, output field, environment variable or error code is a contract change. It ships in one pull request with the code that implements it, and with its ADR when a decision changes. The contract tests link the docs and the code, so they must change together. Discuss the change before you start. Do not propose it in a docs-only pull request: its tests cannot pass.
- Do not add prose to the JSON output. It holds the API body and nothing else. Sentences for a human go in the text that a terminal shows, on stderr around the data (ADR 0023).
- Do not wrap API responses. Return the API body as it is. See `docs/contract/output.md`.
- Do not catch errors to print them yourself. Let `BaseCommand` render them.
- Do not add interactive features (menus, TUI, spinners on stdout). A spinner on stderr when stderr is a TTY is fine.
- Do not change `src/lib/output.ts`, `src/lib/errors.ts` or `src/lib/config.ts` in a command pull request. These files hold the contract and change in their own pull request.
- Do not touch `src/lib/clients/management/generated/`. Fix the OpenAPI spec or the generator config instead.
- Do not edit an accepted ADR. Write a new one.

## Where to read more

- `docs/contract/commands.md`: the naming rules that turn an API route into a command, the exceptions, the global and shared flags, the commands without an API
- `docs/contract/output.md`: output format, error format, exit codes, async tasks, pagination
- `docs/contract/config.md`: projects, the config file, connection resolution, Cloud projects, environment variables, secrets
- `openapi/`: the OpenAPI documents downloaded by `pnpm openapi`, the reference for every command name
- `docs/contract/testing.md`: test levels, how the two local APIs start, what runs in pull request CI
- `docs/adr/`: the decisions and the reasons
