# ADR 0024: `meili trial start`, one command for a free trial of Meilisearch Cloud

Status: accepted. Date: 2026-11-24.

## Context

A developer or a coding agent wants to go from "no account" to a running Meilisearch Cloud project. Without help, this takes several commands, and two identifiers to find: `auth login`, `team list`, `resource list` to find the free trial resource of a region, `project add --sync-config --wait`. `teleport` does all of this, but it asks questions, so an agent cannot run it (ADR 0015).

The first proposal had two modes. In a terminal, the command asked questions: the name, the region, and a confirmation. Without a terminal or with `--non-interactive`, it asked nothing. It wrote a stream of JSON events on stdout, used new exit codes 10 to 13 and a new error code `free_trial_already_used`, and wrote the URL and the master key to an env file with `--env-file`.

Alternatives considered:

- **Two modes, as proposed.** An agent is the main user, and it gets the same result with flags. Two modes double the behaviors to test and to document. A command that asks in a terminal also breaks ADR 0015: an interactive command refuses to run without a terminal.
- **A stream of JSON events on stdout.** `output.md` says stdout carries one JSON document. The login URL already reaches the agent on stderr, as with `auth login`.
- **New exit codes and a new error code.** The existing codes already cover each case. An agent branches on the `code` of the error.
- **`--env-file`.** It writes the strongest key of the project into a file of the user's repository, against ADR 0013. The config file already holds it, and the agent reaches the project with `--project <name>`. This can come later, in its own decision.

## Decision

`meili trial start` is a command without an API, listed in `commands.md`. It never asks a question. It is not an interactive command of ADR 0015. Every choice has a flag with a default:

- **Login.** It uses the stored session, refreshed when needed. Without a session, it runs the browser login of `auth login`, which also creates an account. `--no-login` fails with `cli_auth_missing`, exit 3, instead. The login waits five minutes, then fails with `cli_timeout`, exit 5.
- **One trial per account.** When the account has a free trial project that is not terminated and whose trial has not ended, the command creates nothing. It waits until that project runs, adds it to the config file if needed, and prints it with `"created": false`. So an agent can run the command again after a timeout or an error.
- **Team.** `--team-id`, else the only team of the account. With several teams and no `--team-id`, it fails with `cli_usage`, exit 2, and the hint lists the teams. The CLI does not choose.
- **Region.** `--region-id`, else the region with the lowest latency among those that offer a free trial, measured like `teleport` does.
- **Name.** `--name`, else the name of the current directory, cut to 40 characters, or `meilisearch-trial` when it is shorter than 3.
- **Errors.** The codes of the contract. A used trial is the API's `user_not_entitled_to_free_trial`, passed through, with a CLI hint that names the next step. A failed project is `cli_task_failed`, exit 7.
- **Output.** One JSON object on stdout at the end: `created`, `configProject`, `dashboardUrl`, and `project` as the API returns it, without the master key. The URL to approve and the progress go to stderr.
- **Config file.** The project gets an entry named after it, `<name>-<id>` when the name is taken, with the master key. An entry that the file already has for the project is kept.

## Consequences

- An agent starts a trial with `meili trial start`, relays the URL that stderr shows, and reads one JSON object.
- A Management API error can carry a CLI hint, set by the command that knows the next step.
- A human gets no question and no confirmation. The command creates only a free project, once per account.
- `--env-file` and a headless login for remote sandboxes are left for later decisions.
