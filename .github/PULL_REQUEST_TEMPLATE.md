## What

<!-- One sentence. Example: Add `meili get stats`. -->

## Contract

- [ ] The command name and flags derive from its routes by the naming rules of `docs/contract/commands.md`, and each route is reachable by a distinct set of flags, or the exception is recorded with its reason (or this pull request changes the contract and nothing else)
- [ ] Output goes through `src/lib/output.ts`, errors through `src/lib/errors.ts`
- [ ] The command never waits for a human: no prompt, no question, no `$EDITOR`; a `delete` command spreads `BaseCommand.confirmFlags` and its examples carry `--yes`
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
- [ ] No accepted ADR was edited. A new ADR was added if a decision changed.

## Housekeeping

- [ ] `oclif.manifest.json` regenerated
- [ ] Changeset added, or the change is invisible to users of the package (docs of this repository, tests, CI)
- [ ] New dependency justified below, or none added

## Notes for the reviewer

<!-- Anything the reviewer should look at first. Interface decisions go here. -->
