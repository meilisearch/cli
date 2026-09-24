# Contributing

The contributor guide is `CLAUDE.md`. It is written for coding agents and for humans, and it is the single source of truth for conventions. Read it, then the contract that applies to your change in `docs/contract/`.

Short version:

- one command per pull request, one file per command
- code and docs change in the same pull request
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass before you open the pull request
- decisions live in `docs/adr/`; an accepted ADR is never edited, it is superseded
