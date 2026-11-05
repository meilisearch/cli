# ADR 0020: The CLI reports each help it shows

Status: accepted. Date: 2026-11-05. Extends ADR 0016 and ADR 0019: one more event.

## Context

Rule 18 of `CLAUDE.md` says that everything the user types sends usage analytics. A help runs no command: oclif shows it before any command class runs. So `BaseCommand` sends no `cli_command_run`, and `meili`, `meili --help`, `meili index` and `meili index list --help` send nothing. We cannot see which commands people read about, or whether they run them after.

`docs/contract/output.md` said that `--help` never makes a network call. The point of this promise is that a help never calls an API, even with `--project-url`. The analytics request of ADR 0016 is not an API call, and it never changes the output.

Alternatives considered:

- **No event for the help.** Nothing to build. But a help is often the first thing a new user types, and rule 18 would have an exception.
- **A `cli_command_run` with `help: true`.** One event name for everything typed. But `cli_command_run` counts the runs of a command, and its `exit_code`, `error_code` and `duration_ms` mean nothing for a help. The funnels would have to filter it out.
- **Send what was typed.** It shows how the help was asked: `--help`, `-h`, or no command. But what was typed can hold a value: in `meili index view --id movies --help`, `movies` is an index name. ADR 0016 never sends values.

## Decision

- **`cli_help_shown`**, once per help. Its property is `command`, the command whose help shows, such as `index list`, or `topic`, the topic whose help shows, such as `index`. Both are absent for the root help. Both come from the manifest, never from what was typed. The event carries the properties of every event of ADR 0016.
- **The help class records it, and `bin/run.js` sends it**, through the same `track` and `sendAnalytics` as `BaseCommand`. The rules of ADR 0016 apply: the same opt-outs, a timeout of one second, and no effect on the output or the exit code.
- **`--help` never calls an API.** It sends only this event. `output.md` and `testing.md` say so instead of "never makes a network call".
- **`--version` sends nothing.** It is not a help.

## Consequences

- PostHog shows which commands people read about, and whether a `cli_command_run` of the same command follows.
- `sendAnalytics` sends nothing when no event was collected. So `bin/run.js` calls it after every run, and a command that already sent its events makes no second request.
- A help asked with `--help` and a help shown because no command was given are the same event.
