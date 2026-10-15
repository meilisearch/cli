# ADR 0007: Delete commands require `--yes`

Status: accepted. Date: 2026-10-15.

Supersedes ADR 0002, whose rules it keeps except the one about confirmation.

## Context

ADR 0002 decided that a command runs as written, with no confirmation flag: the agent is the operator, the verb is the intent, and a flag with no question behind it is friction that teaches nothing. That reasoning holds for every verb but one.

A deletion is the only thing the CLI does that the next command cannot undo. A wrong `--index`, an identifier copied from an older plan, a command line reused from a transcript: everywhere else the cost is a retry, here it is the data. An agent writes its command lines from a plan it built itself, and the verb `delete` is the easiest word to carry over from a line that worked somewhere else.

`--yes` is not a question. Nothing is asked, nothing waits for an answer, nothing reads stdin: it is a second token the agent must write on the same line, at the moment it writes the deletion. That is what separates a deletion from a command line that merely looks like one, and what a human can grep for in a transcript.

## Decision

The rules in `docs/contract/output.md` and `docs/contract/config.md` are the public contract of the CLI. In short:

- stdout is data only, stderr is everything else
- `json` is the default output mode, in a terminal or not; `ndjson` streams lists; there is no human mode
- API responses pass through unchanged, no wrapper, no renaming
- errors are JSON on stderr with `code`, `type`, `message`, `link`, `hint`
- exit codes are stable and documented
- never a prompt, never a question, never `$EDITOR`: every command runs as written, and a command of the verb `delete` requires `--yes` on the command line first
- write commands return the task; `--wait` polls to a final status
- `meili schema` describes every command as JSON, always in sync with the code
- configuration works from environment variables alone, with no config file and no `HOME`

Only `src/lib/output.ts`, `src/lib/errors.ts` and `src/lib/config.ts` implement these rules. Commands cannot bypass them.

Destructive, in `output.md`, names the verb `delete` and nothing else: what the other verbs write, a later command writes again, an `update` as much as the rest. `--yes` is one required boolean flag, shared as `BaseCommand.confirmFlags`, and every command of the verb `delete` spreads it. No environment variable stands for it: a confirmation an environment can pre-arm is not one.

## Consequences

- A `delete` command without `--yes` fails like any command missing a required flag: `cli_usage`, exit 2, before the credentials are read and before any network call. No new error code, nothing new for an agent to parse, and `--help` and `meili schema` show `--yes` as required.
- The rule about verbs lives in the contract test, not in the binary: `test/contract/commands.test.ts` checks that every command under `src/commands/delete/` declares the flag and that no other command does. A `delete` command that forgets the group, or a `create` command that invents a confirmation of its own, turns the suite red before review. What the binary knows is narrower and enough: a required flag that oclif refuses to do without. Keying the refusal on the command's verb at runtime was considered and dropped: the verb comes from `this.id`, which oclif fills from the manifest, so it is empty when a test runs a command class directly, and the rule would then hold in the binary but not in the tests.
- The selector rule is unchanged: `delete documents` still refuses to run without `--ids`, `--filter` or `--all`.
- Every command line that deletes, in the documentation, in the examples and in the tests, carries `--yes`.
- This is a breaking change for the `delete` commands: a major version once the CLI is released, a minor one before 1.0.
- The consequences of ADR 0002 stand: any change to these rules needs a contract pull request first, human comfort features stay out of scope, and reviewers check the interface rather than the implementation.
