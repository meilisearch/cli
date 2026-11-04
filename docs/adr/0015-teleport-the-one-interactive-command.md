# ADR 0015: `meili teleport`, the one interactive command

Status: accepted. Date: 2026-11-04.

## Context

A user with data in a Meilisearch instance, local or in production, wants to try Meilisearch Cloud with that data. Without help, this takes several commands, and several identifiers to find: log in, find a team id and a resource id, create the project, add it to the config file, export the data, and wait until the new project has indexed it. For a human who discovers the CLI, it is too much.

`commands.md` says that comfort commands for humans, such as interactive modes or wizards, come later, through a contract pull request. This is the first one.

## Decision

- **`meili teleport` asks questions.** It runs only when stdin and stderr are terminals. Otherwise, it fails with `cli_usage`, exit 2, and the hint gives the commands that do the same without questions. An agent that runs it by mistake gets the answer it needs.
- **It is an exception to ADR 0002, ADR 0004 and ADR 0007**, for this command only. It asks questions, it uses both APIs, and in a terminal its errors are text for a human. It declares `static api = "none"`, because `BaseCommand` cannot connect before the command runs: the login happens in the middle of it. It builds its clients through `BaseCommand` all the same.
- **Everything it shows goes to stderr**: questions, progress, messages, errors. stdout stays empty, so rule 1 holds without exception. Its JSON output mode has no effect.
- **When stderr is not a terminal, its errors are the JSON of the contract**, as on every command.
- **Questions use `@inquirer/prompts`**, to choose with the arrow keys. The progress bar is drawn by the CLI, with no dependency.
- **Steps, in this order:**
  1. The source is the entry of `--project`. Without it, the command shows the entries of the config file, and offers to enter a URL and a key.
  2. The source is checked with `POST /export` without a body. The instance checks the key first, then answers 400 `missing_payload` and enqueues nothing. A 401, 403 or 404, or no answer, shows why and asks for the source again.
  3. The stored session is used when the API accepts it. Otherwise, the browser login of `auth login` runs. It also creates an account.
  4. Region, in the order of the API: the API does not expose what the dashboard measures to find the closest region.
  5. Team, asked only when there are several.
  6. Project name, `<source>-cloud` by default.
  7. The free trial resource of the region. On `user_not_entitled_to_free_trial`, or in a region without a free trial, the other resources of the region, with their size and the link to the prices. A missing payment method or address stops the command with the link to the billing page of the team.
  8. Wait until the project is `running`, with the link to the prices.
  9. Add the project to the config file, as `add projects --sync-config` does.
  10. Export, with the progress of the batch of the source. Then wait until the new project has no task to process: it is new, so all its tasks come from the export.
  11. Show how to search with the CLI, and the links to the preview and the settings of the project in the dashboard.
- **No agent path is added in this change.** `get teams`, `get regions` and `get resources` come later. Until then, an agent finds the team and the resource ids in the dashboard.

## Consequences

- One command does not follow rules 4 and 5 of `CLAUDE.md`, and the rules say so.
- A test runs the command with the questions mocked, and with stdin and stderr marked as terminals.
- A new interactive command needs its own ADR. This one does not open the door to questions on the other commands.
