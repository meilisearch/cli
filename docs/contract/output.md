# Output contract

This file defines what `meili` writes, where it writes it, and in which format. Agents depend on these rules, so a change here is a breaking change and needs a major version.

## Streams

- stdout carries data only: one JSON document, or for a human the text of that data. Nothing else, ever.
- stderr carries everything else: errors, warnings, progress, debug traces, deprecation notices, and for a human the status sentence and the next steps of a command.
- A command that produces no data (for example a delete that the API answers with 204) writes nothing on stdout and exits with code 0. It may write one line on stderr when stderr is a TTY, and for a human it says what it did.
- A command that waits for a human, `auth login`, writes on stderr what that human must act on, TTY or not. The URL to approve must reach a person even when the output is piped.
- An interactive command, such as `teleport`, writes its questions, its progress and its messages on stderr, and nothing on stdout. It is for humans, so the rules of this file for readability do not bind it: in a terminal, it may use colors, symbols and animations. `NO_COLOR` removes the colors. Its errors are text for a human. Without a terminal, it fails with the JSON error of this file. See ADR 0015.

## Format

The format depends on stdout, and on two switches. See ADR 0023.

| | stdout is a terminal | stdout is not a terminal |
|---|---|---|
| Default | Text for a human, with colors | Compact JSON |
| `--json` or `MEILI_JSON=1` | Compact JSON | Compact JSON |

Compact JSON is one line. Field order and names are the API's. This is the format for agents and scripts: an agent that runs in a pseudo-terminal gives `--json` or sets `MEILI_JSON=1`.

The text for a human has three parts:

- a **status sentence** on stderr, with a symbol: `✓` done, `◐` in progress, `✗` failed
- the **data** on stdout: a table for a list, one field per line for one item
- the **next step** on stderr, with the exact command to run

The text holds the same data as the JSON, with these rules:

- No value is cut. Dates and durations stay as the API writes them. No relative date, pager, spinner or emoji.
- A list that shows only some fields says "Simplified view", and how to see everything.
- A list is a table. Its headers are the attribute names in upper snake case, `TEAM_ID` for `teamId`. It shows the attributes with a simple value (text, number, boolean, null), at most 6. Its other envelope fields, such as `limit`, go on the status line.
- One item shows every attribute, one per line, nested ones indented.
- A write prints its task: `◐` and the command to follow it, or with `--wait`, `✓` or `✗` and the final task.
- The headers of a document list keep the exact attribute names, which `--fields` takes. A document list shows the attributes that `--fields` chose, or else the first ones with a simple value (text, number, boolean), at most 4.
- Colors only carry meaning: the status, the symbols, and grey for the labels and the absent values. `--no-color` or `NO_COLOR` removes them.
- The `masterKey` of `project add` stays masked, like in the JSON.

Every command has this text. By default, `BaseCommand` builds it from the API response with the rules above. The project and document commands have their own text, with sentences about what they did and what to run next.

An interactive command writes on the stderr of its own terminal, see "Streams".

## Pass-through

The CLI returns the API response body without a wrapper and without renaming. The agent gets exactly what the API documentation shows. The CLI must not add fields to a response.

One exception, documented in `commands.md`: commands that do not call an API (`schema`, `config list`, `auth status`) define their own shape in their `--help`.

Pass-through has three consequences:

- Both APIs name their fields in camelCase, but they do not use the same names for everything: a key is `apiKey` in a Meilisearch config file and `masterKey` on a Cloud project. The CLI does not normalize names. An agent reads the documentation of each API and gets exactly that.
- A `list` command returns the list envelope, even when it filters one identifier: `task list --ids 42` prints `{"results": [the task], …}`. A `view` command returns the item itself: `task view --id 42` prints the task.
- Some API responses contain secrets by design, for example the `key` of an API key. They are data the agent needs, and they go to stdout unchanged. Redaction applies to stderr, `--debug` traces and logs, not to the data stream. One exception: `project add` prints the `masterKey` of the project it creates masked, `****9z8y`; `--sync-config` writes it to the config file instead. See ADR 0013.

## Errors

Errors go to stderr. In JSON, they are one compact JSON document:

```json
{
  "error": {
    "code": "index_not_found",
    "type": "invalid_request",
    "message": "Index `movies` not found.",
    "link": "https://docs.meilisearch.com/errors#index_not_found",
    "hint": "Run `meili index list` to see the available indexes."
  }
}
```

- API errors keep the API fields unchanged: `code`, `type`, `message`, `link`. The CLI never rewrites an API message. Both APIs answer in that shape, so the CLI passes both through the same way, and invents no code for either.
- `hint` is optional and owned by the CLI. It names the next command to run. It is a full sentence, with no markdown except backticks around commands. On an unknown command, the hint names the closest existing command, "Did you mean `meili index delete`?". The CLI computes it from the manifest. It also reads the words of other CLIs (`get`, `create`, `edit`, …) and the reverse order: `meili get indexes` gives `meili index list`. When the unknown command is an existing command followed by a value, the hint says that meili takes no positional argument. The CLI suggests; it never asks.
- Errors that come from the CLI itself use codes that start with `cli_`, and `type` set to `cli`. Current list: `cli_usage`, `cli_config`, `cli_auth_missing`, `cli_auth_failed`, `cli_timeout`, `cli_network`, `cli_task_failed`, `cli_input_invalid`, `cli_internal`. `cli_auth_missing` means the CLI does not have a credential. `cli_auth_failed` means the authorization server refused to give or to accept a credential. `cli_internal` is an unexpected error inside the CLI itself, a bug to report, and exits 1. Adding a code is a contract change.
- An HTTP error with no error body does not come from the API: a proxy or a wrong URL answered. For either API, it is `cli_network`, exit 6, and the message names the server and the status.
- Stack traces appear only with `--debug`.

For a human, the error is text with the same fields: the message and the code first, then the hint, then the link in grey.

```
✗ Index `movis` not found. (index_not_found)
  Docs: https://docs.meilisearch.com/errors#index_not_found
```

## Warnings

A warning is a condition that does not stop the command. It goes to stderr as one compact JSON document with the shape of an error, under `warning` instead of `error`, with a code from the table of this file. The exit code and stdout do not change. For a human, it is text like an error, with `!` in place of `✗`.

```json
{"warning":{"code":"cli_config","type":"cli","message":"The config file /home/me/.config/meili/config.json is readable by others.","hint":"Run `chmod 600 /home/me/.config/meili/config.json`."}}
```

The CLI warns when the config file is readable by others, see `config.md`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. With `--wait`, the task reached `succeeded`, or the project of `project add` reached `running`. |
| 1 | API error not covered below, or unexpected error. |
| 2 | Usage error: unknown command, bad or missing flag, flags that call for two different routes, invalid input file. |
| 3 | Authentication or authorization failed: missing API key or token, HTTP 401 or 403 from either API. |
| 4 | Resource not found: HTTP 404 from either API. |
| 5 | Timeout: `--wait` exceeded `--timeout`, or the HTTP request timed out. |
| 6 | Cannot connect: DNS failure, connection refused, TLS error. |
| 7 | Task finished with status `failed` or `canceled`, or the project of `project add` with status `failed` (only with `--wait`). The final task or project is still printed on stdout. |

No other code is used on purpose. If a new situation needs its own code, add it to this table first.

## Asynchronous operations

Most write operations of the Meilisearch API return a task, not a result. The CLI keeps that model.

- Without `--wait`, the command prints the task the API returned (`taskUid`, `status: "enqueued"`, ...) and exits 0.
- With `--wait`, the command polls `GET /tasks/{uid}` until the status is `succeeded`, `failed` or `canceled`. It prints the final task object and exits with 0 or 7. For a human, the error of a failed task comes first, then the task.
- Polling starts at 100 ms and grows to a maximum of 1 s between calls.
- `--timeout` accepts a duration: `500ms`, `30s`, `2m`. Default `10m`. On timeout, the CLI prints an error with code `cli_timeout` and exits 5. The task keeps running on the server.
- Progress ("waiting for task 42, status processing") goes to stderr, and only when stderr is a TTY.

A Cloud project is not ready when `POST /api/v2/projects` answers. Its `status` says when it is ready, and its `url` may be `null` until then. `meili project add --wait` follows the same rules, with the project instead of the task:

- It polls `GET /api/v2/projects/{id}` until `status` is `running` or `failed`. It prints the final project and exits with 0, or with 7 and `cli_task_failed`. With `--sync-config`, the entry is written only once the project is `running`.
- Polling starts at 1 s and grows to a maximum of 5 s between calls, because creating a project takes minutes.
- The final project is printed as `GET /api/v2/projects/{id}` returns it, without `masterKey`: only the creation returns it. `--sync-config` writes the key from the creation to the config file.
- On timeout, the CLI returns `cli_timeout` and exits 5. The creation continues on the server, and nothing is written to the config file.
- Progress ("waiting for project 343, status creating") goes to stderr, and only when stderr is a TTY.

## Destructive commands

Destructive commands are the commands of the verb `delete`, as `commands.md` derives them. No other verb is destructive: what another verb writes, a later command can write again.

- A command of the verb `delete` requires `--yes`. Without it, the command refuses to run, with `cli_usage` and exit 2, before any network call, like for any missing required flag.
- `--yes` is a flag, never a question. The CLI does not ask, does not wait, and does not read stdin for an answer. No environment variable stands for it, so an environment can never confirm a deletion for the agent. The confirmation is on the command line, or it does not exist.
- A deletion that needs a selector refuses to run without one: `document delete --index movies --yes` alone is a usage error, exit 2. `--all` is the explicit way to delete every document. The selector may come from `--file` or `--data`, and then the shape of the body selects the route. Two selectors that call for two different routes are a usage error, exit 2, before any network call.

## Input

- `--file <path>` reads a body from a file. `--file -` reads from stdin. The CLI checks that the content is JSON before it sends anything. Otherwise it fails with `cli_input_invalid` and exit 2.
- `--data <json>` passes a body inline.
- A body-field flag given with `--file` or `--data` overrides that field in the body. In the same way, a flag overrides its environment variable.
- The value `null` on a flag sends a JSON null: `--expires-at null`, `--stop-words null`.
- A command never reads stdin unless `--file -` or `--project-api-key -` is given. This avoids a hang when an agent runs it in a pipeline.
- The CLI refuses an input only when it can say what is wrong without the API. The CLI must parse a body before it can merge the flags into it, so `--file` and `--data` fail as above with `cli_input_invalid`. A flag that `--help` types, as an integer or as one of a closed list of values, is refused with `cli_usage` and exit 2 before any call.
- Every other value is sent unchanged, and the API refuses it with its own code and its own message. The command converts the values that the route types as a fractional number or as an object: `--ranking-score-threshold`, `--vector`, `--hybrid`. Text that spells a valid value becomes that value. Text that does not is sent as text. So `meili search --ranking-score-threshold abc` answers `invalid_search_ranking_score_threshold` and exits 1. The CLI never checks again what the API checks, and never invents a message or a code for it. Converting more than that would change the value silently: `Number` reads `0x1` as 1 and writes an overflow as `null`. An API that reads a null as "no value" then answers 0 and returns the wrong data.

## Pagination

- `--limit` and `--offset` (or `--from` for tasks and batches) are passed to the API unchanged.
- `--all` follows the API pagination until the end. The CLI returns the envelope of the last page, with `results` replaced by the full list and without the fields that describe one page: `limit` and `offset`, or `limit` and `from` on the routes that page with a cursor.
- The list commands of the Management API do not offer these flags yet. The Management API numbers its pages instead of counting an offset, and the flags wait until the two APIs page the same way. Each command prints the first page as the API sends it, envelope included.

## Help

- Every command has a `description` of one sentence and at least two `examples`. Every flag has a description of one sentence. A flag that takes a value documents it with a `helpValue` or a list of options.
- The help of a command shows its output flags first, `--json` and `--no-color`, right after the usage.
- `--help` never calls an API. It sends only its `cli_help_shown` event, see "Analytics" in `config.md` (ADR 0020).
- `meili --help` lists every resource with its commands, in three sections: the commands without a route, then those of the Meilisearch API, then those of the Management API. Then come the global flags and the environment variables (ADR 0018).
- `meili schema` prints the index: the global flags once, then one entry per command with its `id`, its `description` and its `routes`. In the index, the description is only the first paragraph of the command description. The rest is a warning, and only the detail shows it. The index is the cheapest way for an agent to see everything that exists.
- `meili schema --command "index list"` prints that one command in full: `id`, `description`, `api`, `routes`, `async`, `keyActions`, the `flags` the command declares itself, and its `examples`. The global flags are not repeated there, because they belong to the index. `meili config set --project` is listed, required and with its own description, because that command declares it. `--debug` is not listed, because no command declares it. An unknown `--command` is `cli_usage`, exit 2, with a hint that names the closest command, or `meili schema` when no command is close.
- A field that would say nothing is absent, not empty or false: no `routes` on a command without an API, no `keyActions` when the routes need none, no `async` on a command that offers no `--wait`, and no `required` on an optional flag. Every command that returns a task offers `--wait`, and so does `project add`.
- The index reads the oclif manifest. `--command` reads it too, and loads the command class for its own flags. Both always match the code. There is no third level: `oclif.manifest.json` is there for anyone who wants everything. See ADR 0008.

## Versioning

- The JSON output shape, the error shape, the exit codes and the command names are the public contract. The text for a human is not: it may change in any version, so a script or an agent reads the JSON. A breaking change to any of them is a major version.
- A new command, a new flag, or a new optional field in a response owned by the CLI is a minor version.
- Before 1.0, a breaking change is a minor version.
