# ADR 0015: Interactive commands for humans, starting with `meili teleport`

Status: accepted. Date: 2026-11-04.

## Context

A user with data in a Meilisearch instance, local or in production, wants to try Meilisearch Cloud with that data. Without help, this takes several commands, and several identifiers to find: log in, find a team id and a resource id, create the project, add it to the config file, export the data, and wait until the new project has indexed it. For a human who discovers the CLI, it is too much.

`commands.md` says that comfort commands for humans, such as interactive modes or wizards, come later, through a contract pull request. This ADR sets the rules of such a command, an interactive command, and adds the first one, `meili teleport`.

## Decision

### Interactive commands

An interactive command asks questions in a terminal and guides a human through several steps. ADR 0002 and ADR 0007 say that no command asks a question. They keep holding for every other command. An interactive command follows these rules:

- **It runs only when stdin and stderr are terminals.** Otherwise, it fails with `cli_usage`, exit 2, and the hint gives the commands that do the same without questions. An agent that runs it by mistake gets the answer it needs.
- **Everything it shows goes to stderr**: questions, progress, messages, errors. stdout stays empty, so rule 1 holds.
- **In a terminal, its errors are text for a human.** When stderr is not a terminal, they are the JSON of the contract, as on every command.
- **Its questions use `@inquirer/prompts`**, to choose with the arrow keys, through `src/lib/terminal.ts`. A progress bar is drawn by the CLI, with no dependency.
- **It is listed in "Commands without an API" of `commands.md`**, with the commands that do the same without questions.
- **It may use both APIs**, against ADR 0004, when its steps need them. It then declares `static api = "none"`, because `BaseCommand` cannot connect before the command runs: a login can happen in the middle of it. It builds its clients through `BaseCommand` all the same.

### `meili teleport`

It moves the data of a Meilisearch project to a new Meilisearch Cloud project. Its steps, in this order:

1. The source is the entry of `--project`. Without it, the command shows the entries of the config file, and offers to enter a URL and a key.
2. The source is checked with `POST /export` without a body. The instance checks the key first, then answers 400 `missing_payload` and enqueues nothing. A 401, 403 or 404, or no answer, shows why and asks for the source again.
3. The stored session is used when the API accepts it. Otherwise, the browser login of `auth login` runs. It also creates an account.
4. Region, as the dashboard shows them: each region is pinged three times at `https://ping.<regionUrl>`, and the median is its latency. The regions are sorted by latency, the closest first and marked `(closest)`. A green label region has a 🌱. A region that does not answer comes last, without a latency.
5. Team, asked only when there are several. The teams are grouped by organization.
6. Project name, `<source>-cloud` by default.
7. The free trial resource of the region. On `user_not_entitled_to_free_trial`, or in a region without a free trial, the plans of the region that have a monthly estimation, except the Build plan, with their size and their price. A missing payment method or address stops the command with the link to the billing page of the team.
8. Wait until the project is `running`, with the link to the prices.
9. Add the project to the config file, as `add projects --sync-config` does.
10. Export, with the progress of the batch of the source. Then wait until the new project has no task to process: it is new, so all its tasks come from the export.
11. Show how to search with the CLI, and the links to the preview and the settings of the project in the dashboard.

No agent path is added in this change. `get teams`, `get regions` and `get resources` come later. Until then, an agent finds the team and the resource ids in the dashboard.

## Consequences

- Rule 4 of `CLAUDE.md` names interactive commands as the case where a command asks questions.
- The tests of an interactive command mock the questions, and mark stdin and stderr as terminals.
- The next interactive command follows the rules above, through a contract pull request like any command without an API. It needs a new ADR only if it changes these rules.
