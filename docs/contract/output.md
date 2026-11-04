# Output contract

This file defines what `meili` writes, where it writes it, and in which format. Agents depend on these rules, so a change here is a breaking change and needs a major version.

## Streams

- stdout carries data only. One command writes one JSON document (or one NDJSON stream). Nothing else, ever.
- stderr carries everything else: errors, warnings, progress, debug traces, deprecation notices.
- A command that produces no data (for example a delete that the API answers with 204) writes nothing on stdout in `json` mode and exits with code 0. It may write one line on stderr when stderr is a TTY.
- A command that waits for a human, `auth login`, writes on stderr what that human must act on, TTY or not. The URL to approve must reach a person even when the output is piped.
- An interactive command, such as `teleport`, writes its questions, its progress and its messages on stderr, and nothing on stdout. In a terminal, its errors are text for a human. Without one, it fails with the JSON error of this file. See ADR 0015.

## Output modes

`--output <mode>` selects the mode. `MEILI_OUTPUT` sets the default. Without either, the mode is `json`, in a terminal or not: an agent never depends on how its stdout is attached.

| Mode | Rule |
|---|---|
| `json` | One JSON document. Compact (one line) when stdout is not a TTY, indented with two spaces when it is. Field order and names are the API's. |
| `ndjson` | One JSON object per line. Only list routes support it. Each line is one item of the API `results` array. With `--all`, lines stream as pages arrive. |

There is no table mode and no color. In a terminal the JSON is indented, and this makes it readable.

## Pass-through

The CLI returns the API response body without a wrapper and without renaming. The agent gets exactly what the API documentation shows. The CLI must not add fields to a response.

One exception, documented in `commands.md`: commands that do not call an API (`schema`, `config list`, `auth status`) define their own shape in their `--help`.

Pass-through has three consequences:

- Both APIs name their fields in camelCase, but they do not use the same names for everything: a key is `apiKey` in a Meilisearch config file and `masterKey` on a Cloud project. The CLI does not normalize names. An agent reads the documentation of each API and gets exactly that.
- A command that filters a list instead of calling a unit route returns the list envelope: `get tasks --ids 42` prints `{"results": [the task], …}`, and the agent reads `results[0]`.
- Some API responses contain secrets by design, for example the `key` of an API key. They are data the agent needs, and they go to stdout unchanged. Redaction applies to stderr, `--debug` traces and logs, not to the data stream. One exception: `add projects` prints the `masterKey` of the project it creates masked, `****9z8y`; `--sync-config` writes it to the config file instead. See ADR 0013.

## Errors

Errors go to stderr as one JSON document: compact when stderr is not a TTY, indented when it is.

```json
{
  "error": {
    "code": "index_not_found",
    "type": "invalid_request",
    "message": "Index `movies` not found.",
    "link": "https://docs.meilisearch.com/errors#index_not_found",
    "hint": "Run `meili get indexes` to see the available indexes."
  }
}
```

- API errors keep the API fields unchanged: `code`, `type`, `message`, `link`. The CLI never rewrites an API message. Both APIs answer in that shape, so the CLI passes both through the same way, and invents no code for either.
- `hint` is optional and owned by the CLI. It names the next command to run. It is a full sentence, with no markdown except backticks around commands. On an unknown command, the hint names the closest existing command, "Did you mean `meili delete indexes`?". The CLI computes it from the manifest. The CLI suggests; it never asks.
- Errors that come from the CLI itself use codes that start with `cli_`, and `type` set to `cli`. Current list: `cli_usage`, `cli_config`, `cli_auth_missing`, `cli_auth_failed`, `cli_timeout`, `cli_network`, `cli_task_failed`, `cli_input_invalid`, `cli_internal`. `cli_auth_missing` means the CLI does not have a credential. `cli_auth_failed` means the authorization server refused to give or to accept a credential. `cli_internal` is an unexpected error inside the CLI itself, a bug to report, and exits 1. Adding a code is a contract change.
- An HTTP error with no error body does not come from the API: a proxy or a wrong URL answered. For either API, it is `cli_network`, exit 6, and the message names the server and the status.
- Stack traces appear only with `--debug`.

## Warnings

A warning is a condition that does not stop the command. It goes to stderr as one JSON document with the shape of an error, under `warning` instead of `error`, with a code from the table of this file. The exit code and stdout do not change. It is compact when stderr is not a TTY, indented when it is.

```json
{"warning":{"code":"cli_config","type":"cli","message":"The config file /home/me/.config/meili/config.json is readable by others.","hint":"Run `chmod 600 /home/me/.config/meili/config.json`."}}
```

The CLI warns when the config file is readable by others, see `config.md`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. With `--wait`, the task reached `succeeded`, or the project of `add projects` reached `running`. |
| 1 | API error not covered below, or unexpected error. |
| 2 | Usage error: unknown command, bad or missing flag, flags that call for two different routes, invalid input file. |
| 3 | Authentication or authorization failed: missing API key or token, HTTP 401 or 403 from either API. |
| 4 | Resource not found: HTTP 404 from either API. |
| 5 | Timeout: `--wait` exceeded `--timeout`, or the HTTP request timed out. |
| 6 | Cannot connect: DNS failure, connection refused, TLS error. |
| 7 | Task finished with status `failed` or `canceled`, or the project of `add projects` with status `failed` (only with `--wait`). The final task or project is still printed on stdout. |

No other code is used on purpose. If a new situation needs its own code, add it to this table first.

## Asynchronous operations

Most write operations of the Meilisearch API return a task, not a result. The CLI keeps that model.

- Without `--wait`, the command prints the task the API returned (`taskUid`, `status: "enqueued"`, ...) and exits 0.
- With `--wait`, the command polls `GET /tasks/{uid}` until the status is `succeeded`, `failed` or `canceled`. It prints the final task object and exits with 0 or 7.
- Polling starts at 100 ms and grows to a maximum of 1 s between calls.
- `--timeout` accepts a duration: `500ms`, `30s`, `2m`. Default `10m`. On timeout, the CLI prints an error with code `cli_timeout` and exits 5. The task keeps running on the server.
- Progress ("waiting for task 42, status processing") goes to stderr, and only when stderr is a TTY.

A Cloud project is not ready when `POST /api/v2/projects` answers. Its `status` says when it is ready, and its `url` may be `null` until then. `meili add projects --wait` follows the same rules, with the project instead of the task:

- It polls `GET /api/v2/projects/{id}` until `status` is `running` or `failed`. It prints the final project and exits with 0, or with 7 and `cli_task_failed`. With `--sync-config`, the entry is written only once the project is `running`.
- Polling starts at 1 s and grows to a maximum of 5 s between calls, because creating a project takes minutes.
- The final project is printed as `GET /api/v2/projects/{id}` returns it, without `masterKey`: only the creation returns it. `--sync-config` writes the key from the creation to the config file.
- On timeout, the CLI returns `cli_timeout` and exits 5. The creation continues on the server, and nothing is written to the config file.
- Progress ("waiting for project 343, status creating") goes to stderr, and only when stderr is a TTY.

## Destructive commands

Destructive commands are the commands of the verb `delete`, as `commands.md` derives them. No other verb is destructive: what another verb writes, a later command can write again.

- A command of the verb `delete` requires `--yes`. Without it, the command refuses to run, with `cli_usage` and exit 2, before any network call, like for any missing required flag.
- `--yes` is a flag, never a question. The CLI does not ask, does not wait, and does not read stdin for an answer. No environment variable stands for it, so an environment can never confirm a deletion for the agent. The confirmation is on the command line, or it does not exist.
- A deletion that needs a selector refuses to run without one: `delete documents --index movies --yes` alone is a usage error, exit 2. `--all` is the explicit way to delete every document. The selector may come from `--file` or `--data`, and then the shape of the body selects the route. Two selectors that call for two different routes are a usage error, exit 2, before any network call.

## Input

- `--file <path>` reads a body from a file. `--file -` reads from stdin. The CLI checks that the content is JSON before it sends anything. Otherwise it fails with `cli_input_invalid` and exit 2.
- `--data <json>` passes a body inline.
- A body-field flag given with `--file` or `--data` overrides that field in the body. In the same way, a flag overrides its environment variable.
- The value `null` on a flag sends a JSON null: `--expires-at null`, `--stop-words null`.
- A command never reads stdin unless `--file -` or `--project-api-key -` is given. This avoids a hang when an agent runs it in a pipeline.
- The CLI refuses an input only when it can say what is wrong without the API. The CLI must parse a body before it can merge the flags into it, so `--file` and `--data` fail as above with `cli_input_invalid`. A flag that `--help` types, as an integer or as one of a closed list of values, is refused with `cli_usage` and exit 2 before any call.
- Every other value is sent unchanged, and the API refuses it with its own code and its own message. The command converts the values that the route types as a fractional number or as an object: `--ranking-score-threshold`, `--vector`, `--hybrid`. Text that spells a valid value becomes that value. Text that does not is sent as text. So `meili search --ranking-score-threshold abc` answers `invalid_search_ranking_score_threshold` and exits 1. The CLI never checks again what the API checks, and never invents a message or a code for it. Converting more than that would change the value silently: `Number` reads `0x1` as 1 and writes an overflow as `null`. An API that reads a null as "no value" then answers 0 and returns the wrong data.

## Pagination

- `--limit` and `--offset` (or `--from` for tasks and batches) are passed to the API unchanged. When `--id` selects a unit route, they are ignored and not sent.
- `--all` follows the API pagination until the end. With `ndjson`, the items stream. With `json`, the CLI returns the envelope of the last page, with `results` replaced by the full list and without the fields that describe one page: `limit` and `offset`, or `limit` and `from` on the routes that page with a cursor.
- `meili get projects` does not offer these flags yet. The Management API numbers its pages instead of counting an offset, and the flags wait until the two APIs page the same way. The command prints the first page as the API sends it, envelope included, and `ndjson` streams the `results` of that page.

## Help

- Every command has a `description` of one sentence and at least two `examples`. Every flag has a description of one sentence. A flag that takes a value documents it with a `helpValue` or a list of options.
- `--help` never makes a network call.
- `meili schema` prints the index: the global flags once, then one entry per command with its `id`, its `description` and its `routes`. In the index, the description is only the first paragraph of the command description. The rest is a warning, and only the detail shows it. The index is the cheapest way for an agent to see everything that exists.
- `meili schema --command "get indexes"` prints that one command in full: `id`, `description`, `api`, `routes`, `async`, `keyActions`, the `flags` the command declares itself, and its `examples`. The global flags are not repeated there, because they belong to the index. `meili config set --project` is listed, required and with its own description, because that command declares it. `--debug` is not listed, because no command declares it. An unknown `--command` is `cli_usage`, exit 2, with a hint that names the closest command, or `meili schema` when no command is close.
- A field that would say nothing is absent, not empty or false: no `routes` on a command without an API, no `keyActions` when the routes need none, no `async` on a command that offers no `--wait`, and no `required` on an optional flag. Every command that returns a task offers `--wait`, and so does `add projects`.
- The index reads the oclif manifest. `--command` reads it too, and loads the command class for its own flags. Both always match the code. There is no third level: `oclif.manifest.json` is there for anyone who wants everything. See ADR 0008.

## Versioning

- The JSON output shape, the error shape, the exit codes and the command names are the public contract. A breaking change to any of them is a major version.
- A new command, a new flag, or a new optional field in a response owned by the CLI is a minor version.
- Before 1.0, a breaking change is a minor version.
