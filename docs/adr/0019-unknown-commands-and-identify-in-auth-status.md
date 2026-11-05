# ADR 0019: The CLI reports unknown commands, and `auth status` identifies a session without a user

Status: accepted. Date: 2026-11-05. Extends ADR 0016: one more event, and one more place that identifies.

## Context

ADR 0018 renamed every command. `meili get indexes` is now `meili index list`. When a command does not exist, the `cli_usage` error gives a hint: the closest command, or a note that the command takes no positional argument. This error happens before any command class runs, in `bin/run.js`. So `BaseCommand` sends no `cli_command_run`, and nothing is sent. We cannot see how many people still type the old names, or how often the hint finds the command they wanted.

ADR 0016 identifies the user only when the CLI writes a new session, in `auth login` and in the login step of `meili teleport`. A session written before identification shipped has no `userId`. It stays anonymous until the next login, which can be weeks later. Since ADR 0018, `auth status` calls `GET /api/v2/me` to print the user, so it already has the `id`.

`auth status` reads the session from the credentials file. A session of another Cloud can be there while `MEILI_MANAGEMENT_URL` is not set. ADR 0016 says that the user ids of another Cloud do not belong in the production project.

Alternatives considered:

- **Send what was typed.** It shows the exact old names. But what was typed can hold a value: in `meili index view movies`, `movies` is an index name. ADR 0016 never sends values.
- **Send the first word only**, `get`, to count the old order. The suggestion already shows it: `get indexes` suggests `index list`. A second property adds nothing.
- **Identify in every management command.** Each command would call `/me` once more. `auth status` already calls it.
- **Ask the user to log in again.** No code. But most people never would, and the CLI must never ask (rule 4).

## Decision

- **`cli_command_not_found`**, once, when oclif finds no command with the name typed. Its properties are `reason` and `suggestion`. `reason` is `positional` (a command followed by a value), `typo` (close to a command, in this CLI or in the order of another CLI), or `none`. `suggestion` is the command that the hint names, as written in the manifest, such as `index list`. It is absent when `reason` is `none`. What was typed is never sent. The event carries the properties of every event of ADR 0016, but no `command`, because no command ran.
- **`bin/run.js` sends it**, after it writes the error, through the same `track` and `sendAnalytics` as `BaseCommand`. The rules of ADR 0016 apply: the same opt-outs, a timeout of one second, and no effect on the output or the exit code.
- **`auth status` identifies** a session that has no `userId`. It uses the `id` of the `GET /api/v2/me` call that it already makes, sends one `$identify`, and stores `userId` in `credentials.json`. It does nothing when usage data is not sent.
- **Only a session of Meilisearch Cloud identifies.** `identify` returns nothing when the session names another Cloud, whatever `MEILI_MANAGEMENT_URL` says. This also applies to `auth login` and `meili teleport`.

## Consequences

- PostHog shows how often a mistyped command happens, and which command each one meant. Old names show as `reason: typo` with the new name as `suggestion`.
- `auth status` can now write the credentials file. `config.md` lists it next to `auth login` and the refresh.
- The tests of `bin/run.js` run it as a child process, which msw cannot mock. So the event is tested through `unknownCommand` and `sendAnalytics`, not end to end.
