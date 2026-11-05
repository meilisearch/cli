# Changesets

Every pull request that changes the CLI for its users adds a changeset in `.changeset/`. Write it by hand: `pnpm changeset` is interactive.

The version type follows `docs/contract/output.md`, section Versioning:

- `minor`: a new command, a new flag, or a new optional field in a response owned by the CLI.
- `patch`: a fix.
- `major`: a breaking change to the output shape, the error shape, the exit codes or the command names. Before 1.0, it is `minor`.

`.changeset/changelog.mjs` copies the text into `CHANGELOG.md` as it is, with no commit hash.

A reader understands the change at a glance: what kind of change, and which part of the CLI.

- One line, one sentence, about 15 words at most.
- Start with the kind of change: `Add`, `Fix`, `Change` or `Remove`.
- Then name the scope: a command (`meili task list`), a flag (`--wait`), or an area (usage analytics, install script). A new command is named without its flags.
- Say what a user sees, not how the code does it.
- End with the link to the pull request: `([#77](https://github.com/meilisearch/cli/pull/77))`. Open the pull request first, then add its number to the changeset.
- No commit hash or title, no ADR number, no file path of the repository.
- After the scope, start with the verb: `prints the logged-in user`, not `it prints the logged-in user`.

A breaking change starts with `**Breaking:**`. It can be longer than one line, to help the user move to the new version: show what to type before and what to type now, for example with a table. Stay clear and concise: give only what the user needs to change.

```md
Add `meili region list`. ([#63](https://github.com/meilisearch/cli/pull/63))
Fix `meili auth login --help`: says that the command also creates an account. ([#74](https://github.com/meilisearch/cli/pull/74))
Change `meili --version`: prints the same JSON as `meili version`. ([#77](https://github.com/meilisearch/cli/pull/77))
**Breaking:** Remove `--output`. Every command prints JSON: drop `--output json` from your scripts. ([#70](https://github.com/meilisearch/cli/pull/70))
```
