# Changesets

Every pull request that changes the CLI adds a changeset: a file written by hand in `.changeset/`, because `pnpm changeset` is interactive. A new command is `minor`, a fix is `patch`, a change to the public contract (output shape, error shape, exit codes, command names) is `major`, or `minor` before 1.0. See `docs/contract/output.md`, section Versioning.

The release tooling reads these files to bump the version and write the changelog. `changelog.mjs` copies the text as it is, with no commit hash.

## How to write the text

A reader understands the change at a glance: what kind of change, and which part of the CLI.

- One line, one sentence, about 15 words at most.
- Start with the kind of change: `Add`, `Fix`, `Change` or `Remove`.
- Then name the scope: a command (`meili task list`), a flag (`--wait`), or an area (usage analytics, install script).
- Say what a user sees, not how the code does it.
- No commit hash or title, no pull request number, no ADR number, no file path of the repository.
- A breaking change starts with `**Breaking:**`. It can add one more line that says what to do instead.

```md
Add `meili stats --index <index>`.
Fix `meili auth login --help`: it says that the command also creates an account.
Change `meili --version`: it prints the same JSON as `meili version`.
**Breaking:** Remove `--output`. Every command prints JSON.
```
