# ADR 0002: Agent-first output contract

Status: superseded by ADR 0007. Date: 2026-09-29.

## Context

`meili` must be coding agent friendly. An agent cannot see a screen and cannot answer a prompt. It reads everything as text it must parse. Some CLIs decorate their output, use one exit code for every error, prompt when a flag is missing, or document flags that do nothing. Such a CLI forces the agent to guess. We want no guessing: every behavior is specified, tested and machine-readable.

A terminal does not mean a human either. Some sandboxes run the commands of an agent in a pseudo-terminal. If a default depends on how stdout is attached, the agent must guard against it on every call.

## Decision

The rules in `docs/contract/output.md` and `docs/contract/config.md` are the public contract of the CLI. In short:

- stdout is data only, stderr is everything else
- `json` is the default output mode, in a terminal or not; `ndjson` streams lists; there is no other format
- API responses pass through unchanged, with no wrapper and no renaming
- errors are JSON on stderr with `code`, `type`, `message`, `link`, `hint`
- exit codes are stable and documented
- never a prompt, never a confirmation flag, never `$EDITOR`: a destructive command runs as written
- write commands return the task; `--wait` polls until the task reaches a final status
- `meili schema` describes every command as JSON, always in sync with the code
- a Meilisearch command works from the command line alone, with no config file and no `HOME`; a management command needs the session that a human opened by logging in

Only `src/lib/output.ts`, `src/lib/errors.ts` and `src/lib/config.ts` implement these rules. Commands cannot bypass them.

## Consequences

- An agent never sets `--output`. In a terminal the JSON is indented, so it is easy to read.
- A destructive command has nothing to confirm. An agent is the operator. A flag that answers no question adds friction and teaches nothing. The intent is already in the command line: the verb is `delete`, `cancel` or `swap`, and the description says what the command destroys. Reviewers read the verb. The only guard is a selector: `delete documents` refuses to run without `--ids`, `--filter` or `--all`.
- Any change to these rules is a breaking change. It needs a major version, and a contract pull request first.
- Human comfort is in scope, but it never overrides these rules. It goes into the documentation and the `--help` now, and into comfort commands later, each through a contract pull request.
- Reviewers check the interface (names, output shape, exit codes, tests), not the implementation. Snapshot tests of `--help` and of the JSON output make interface changes visible in every pull request.
