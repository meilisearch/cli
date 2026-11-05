# Changesets

Every pull request that changes the CLI for its users adds a changeset in `.changeset/`, written by hand because `pnpm changeset` is interactive. A new command is `minor`, a fix is `patch`, a change to the public contract (output shape, error shape, exit codes, command names) is `major`, or `minor` before 1.0 (`docs/contract/output.md`, section Versioning). `.changeset/changelog.mjs` copies the text into `CHANGELOG.md` as it is, with no commit hash.

A reader understands the change at a glance: what kind of change, and which part of the CLI.

- One line, one sentence, about 15 words at most.
- Start with the kind of change: `Add`, `Fix`, `Change` or `Remove`.
- Then name the scope: a command (`meili task list`), a flag (`--wait`), or an area (usage analytics, install script).
- Say what a user sees, not how the code does it.
- No commit hash or title, no pull request number, no ADR number, no file path of the repository.
- After the scope, start with the verb: `prints the logged-in user`, not `it prints the logged-in user`.

A breaking change starts with `**Breaking:**`. It can be longer than one line, to help the user move to the new version: show what to type before and what to type now, for example with a table. Stay clear and concise: give only what the user needs to change.

```md
Add `meili stats --index <index>`.
Fix `meili auth login --help`: says that the command also creates an account.
Change `meili --version`: prints the same JSON as `meili version`.
**Breaking:** Remove `--output`. Every command prints JSON: drop `--output json` from your scripts.
```
