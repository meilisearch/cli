## What

<!-- One sentence. Example: Add `meili index stats`. -->

## Contract

- [ ] The command, flag or field is listed in `docs/contract/commands.md` (or this pull request changes the contract and nothing else)
- [ ] Output goes through `src/lib/output.ts`, errors through `src/lib/errors.ts`
- [ ] No prompt, no `$EDITOR`, no `fetch` outside `src/lib/clients/`

## Tests

- [ ] `--help` snapshot added or updated on purpose
- [ ] JSON output snapshot for one success and one error case
- [ ] Integration test added (engine commands only)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass locally

## Docs

- [ ] `docs/contract/` updated for every name, flag, variable or code this change adds or renames, or nothing to update
- [ ] No accepted ADR was edited. A new ADR was added if a decision changed.

## Housekeeping

- [ ] `oclif.manifest.json` regenerated
- [ ] Changeset added
- [ ] New dependency justified below, or none added

## Notes for the reviewer

<!-- Anything the reviewer should look at first. Interface decisions go here. -->
