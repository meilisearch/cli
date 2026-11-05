## What

<!-- One sentence. Example: Add `meili stats`. -->

## Contract

- [ ] The command name and flags derive from its routes by the naming rules of `docs/contract/commands.md`, or the name the maintainers chose is recorded as an exception with its reason; each route is reachable by a distinct set of flags (or this pull request changes the contract and nothing else)
- [ ] Output goes through `src/lib/output.ts`, errors through `src/lib/errors.ts`
- [ ] The command never waits for a human: no prompt, no question, no `$EDITOR`, unless it is an interactive command of ADR 0015; a `delete` command spreads `BaseCommand.confirmFlags` and its examples carry `--yes`
- [ ] The description starts with one short sentence, the summary that `meili --help` shows; the detail goes in the next paragraph. It says whether the command is interactive, never who it is for
- [ ] What the user types sends analytics (rule 18): the command extends `BaseCommand` and never calls `process.exit`; every question goes through `src/lib/terminal.ts` with a stable `prompt` id, and every option of `choose` has a stable `id`, unless the option is the user's own data
- [ ] The command never speaks HTTP itself: the SDK or the generated client only, no `fetch` outside `src/lib/clients/`

## Tests

- [ ] `--help` snapshot added or updated on purpose
- [ ] JSON output snapshot for one success case per route and one error case
- [ ] Integration test added (Meilisearch API commands only)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass locally

## Simplicity

- [ ] Nothing in the diff exists for a case the API cannot produce, a caller that does not exist, or a generality nobody asked for (rule 16)
- [ ] Anything shared lives in `src/lib/`, is used by this command, and is named below

## Docs

- [ ] `docs/contract/` updated for every name, flag, variable or code this change adds or renames, or nothing to update
- [ ] The ADRs that touch this change were read; what they decide still holds, or a new ADR says what changed
- [ ] No accepted ADR was edited. A new ADR was added if a decision changed.
- [ ] New or changed prose follows the writing style of rule 17 of `CLAUDE.md`

## Housekeeping

- [ ] `oclif.manifest.json` regenerated
- [ ] Changeset added, or the change is invisible to users of the package (docs of this repository, tests, CI)
- [ ] New dependency justified below, or none added

## Notes for the reviewer

<!-- Anything the reviewer should look at first. Interface decisions go here. -->
