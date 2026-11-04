# ADR 0007: Delete commands require `--yes`

Status: accepted. Date: 2026-10-15. One point is superseded by ADR 0013: the `masterKey` that `add projects` prints is masked, no longer passed through unchanged. ADR 0018 moves the delete commands to files named `delete.ts`, and the contract test checks these files.

Supersedes ADR 0002, whose rules it keeps except the one about confirmation.

## Context

ADR 0002 decided that a command runs as written, with no confirmation flag. The reasons: the agent is the operator, and the verb is the intent. A flag with no question behind it only slows the user down and teaches nothing. That reasoning holds for every verb except one.

A deletion is the only action of the CLI that the next command cannot undo. Mistakes happen: a wrong `--index`, an identifier copied from an older plan, a command line reused from a transcript. For any other verb, the cost of such a mistake is a retry. For a deletion, the cost is the data. An agent writes its command lines from a plan it built itself. The verb `delete` is the easiest word to copy from a line that worked somewhere else.

`--yes` is not a question. Nothing is asked, nothing waits for an answer, and nothing reads stdin. It is a second token that the agent must write on the same line, at the moment it writes the deletion. This token separates a real deletion from a command line that only looks like one. A human can also grep for it in a transcript.

## Decision

The rules in `docs/contract/output.md` and `docs/contract/config.md` are the public contract of the CLI. In short:

- stdout is data only, stderr is everything else
- every command writes JSON, in a terminal or not. There is no other format
- API responses pass through unchanged, with no wrapper and no renaming
- errors are JSON on stderr with `code`, `type`, `message`, `link`, `hint`
- exit codes are stable and documented
- never a prompt, never a question, never `$EDITOR`. Every command runs as written. A command of the verb `delete` requires `--yes` on the command line first
- write commands return the task. `--wait` polls until a final status
- `meili schema` describes every command as JSON, always in sync with the code
- a Meilisearch command works from the command line alone, with no config file and no `HOME`. A management command needs the session a human logged in with

Only `src/lib/output.ts`, `src/lib/errors.ts` and `src/lib/config.ts` implement these rules. Commands cannot bypass them.

In `output.md`, "destructive" names the verb `delete` and nothing else. What the other verbs write, a later command can write again, and this is true of an `update` as well. `--yes` is one required boolean flag, shared as `BaseCommand.confirmFlags`. Every command of the verb `delete` spreads it. No environment variable stands for it: a confirmation that an environment can set in advance is not a confirmation.

## Consequences

- A `delete` command without `--yes` fails like any command with a missing required flag: `cli_usage`, exit 2. It fails before the CLI reads the credentials and before any network call. There is no new error code and nothing new for an agent to parse. `--help` and `meili schema` show `--yes` as required.
- The rule about verbs lives in the contract test, not in the binary. `test/contract/commands.test.ts` checks that every command under `src/commands/delete/` declares the flag, and that no other command does. A `delete` command that forgets the group fails the suite before review. So does an `add` command that invents its own confirmation. The binary knows less, and that is enough: a required flag, which oclif will not run without. Another option was to refuse based on the command's verb at runtime. It was dropped. The verb comes from `this.id`, which oclif fills from the manifest. So it is empty when a test runs a command class directly, and the rule would hold in the binary but not in the tests.
- The selector rule is unchanged: `delete documents` still refuses to run without `--ids`, `--filter` or `--all`.
- Every command line that deletes, in the documentation, in the examples and in the tests, carries `--yes`.
- This is a breaking change for the `delete` commands: a major version once the CLI is released, a minor one before 1.0.
- The consequences of ADR 0002 still apply. Any change to these rules needs a contract pull request first. Human comfort never overrides them. Reviewers check the interface rather than the implementation.
