# ADR 0002: Agent-first output contract

Status: accepted. Date: 2026-09-29.

## Context

`meili` is built for coding agents. An agent cannot see a screen, cannot answer a prompt, and reads everything as text it must parse. A CLI that decorates its output, uses one exit code for every error, prompts when a flag is missing, or documents flags that do nothing forces the agent to guess. We want zero guessing: every behavior is specified, tested and machine-readable.

A terminal does not mean a human, either: some sandboxes run an agent's commands in a pseudo-terminal. A default that depends on how stdout is attached is a default the agent has to defend against on every call.

## Decision

The rules in `docs/contract/output.md` and `docs/contract/config.md` are the public contract of the CLI. In short:

- stdout is data only, stderr is everything else
- `json` is the default output mode, in a terminal or not; `ndjson` streams lists; there is no human mode
- API responses pass through unchanged, no wrapper, no renaming
- errors are JSON on stderr with `code`, `type`, `message`, `link`, `hint`
- exit codes are stable and documented
- never a prompt, never a confirmation flag, never `$EDITOR`: a destructive command runs as written
- write commands return the task; `--wait` polls to a final status
- `meili schema` describes every command as JSON, always in sync with the code
- configuration works from environment variables alone, with no config file and no `HOME`

Only `src/lib/output.ts`, `src/lib/errors.ts` and `src/lib/config.ts` implement these rules. Commands cannot bypass them.

## Consequences

- An agent never sets `--output`. In a terminal the JSON is indented, which is all a human needs to read it.
- A destructive command has nothing to confirm. An agent is the operator; a flag with no question behind it is friction that teaches nothing, and the intent is already in the command line: the verb is `delete`, `cancel` or `swap`, and the description says what it destroys. Reviewers read the verb. The one guard is a selector: `delete documents` refuses to run without `--ids`, `--filter` or `--all`.
- Any change to these rules is a breaking change and needs a major version and a contract pull request first.
- Human comfort features (TUI, prompts, editors, tables, colors) are out of scope.
- Reviewers check the interface (names, output shape, exit codes, tests), not the implementation. Snapshot tests of `--help` and of the JSON output make interface changes visible in every pull request.
