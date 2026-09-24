# Changesets

Every pull request that changes the CLI adds a changeset: `pnpm changeset`. A new command is `minor`, a fix is `patch`, a change to the public contract (output shape, error shape, exit codes, command names) is `major`. See `docs/contract/output.md`, section Versioning.

The release tooling reads these files to bump the version and write the changelog.
