# ADR 0021: `meili --version` is the `meili version` command

Status: accepted. Date: 2026-11-05. Supersedes one point of ADR 0018, that `meili --version` stays the text of oclif, and one point of ADR 0020, that `--version` sends nothing.

## Context

ADR 0018 made `meili version` print the version of the CLI as JSON, `{"version": "0.2.0"}`. `meili --version` kept the text of oclif: `@meilisearch/cli/0.2.0 darwin-arm64 node-v22.12.0`. So two ways to ask the same question give two answers, in two formats. An agent that parses one breaks on the other. The text also holds the platform and the Node version, which the JSON did not.

Alternatives considered:

- **Keep both outputs.** Nothing to build. But the two outputs stay different.
- **The text of oclif for both.** `meili version` would break the rule that a command prints JSON on stdout.
- **JSON with the version only, for both.** The platform and the Node version are lost. They help when a user reports a bug.

## Decision

- **`meili version` prints the version of the CLI, the platform and the Node version as JSON**: `{"version": "0.2.0", "platform": "darwin-arm64", "node": "v22.12.0"}`.
- **`meili --version` runs the `version` command.** `bin/run.js` replaces `--version` with `version` when it is the first argument, before oclif sees it. The two print the same output.
- **`meili --version` sends `cli_command_run`**, with the command `version`, like any command. No new event or property.

## Consequences

- A script that parsed the text of `meili --version` must parse the JSON.
- PostHog counts `meili version` and `meili --version` as the same command. It cannot tell them apart.
- `--version` after a command, as in `meili index list --version`, is not the version. oclif refuses it as an unknown flag, as before.
