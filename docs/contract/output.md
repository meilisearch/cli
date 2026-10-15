# Output contract

This file defines what `meili` writes, where, and in which format. Agents build on these rules, so a change here is a breaking change and needs a major version.

## Streams

- stdout carries data only. One command, one JSON document (or one NDJSON stream). Nothing else, ever.
- stderr carries everything else: errors, warnings, progress, debug traces, deprecation notices.
- A command that produces no data (for example a delete that the API answers with 204) writes nothing on stdout in `json` mode and exits with code 0. It may write one line on stderr when stderr is a TTY.

## Output modes

`--output <mode>` selects the mode. `MEILI_OUTPUT` sets the default. Without either, the mode is `json`, in a terminal or not: an agent never depends on how its stdout is attached.

| Mode | Rule |
|---|---|
| `json` | One JSON document. Compact (one line) when stdout is not a TTY, indented with two spaces when it is. Field order and names are the API's. |
| `ndjson` | One JSON object per line. Only list routes support it. Each line is one item of the API `results` array. With `--all`, lines stream as pages arrive. |

There is no human-oriented mode and no color: the indented JSON of a terminal is what a human reads.

## Pass-through

The CLI returns the API response body without a wrapper and without renaming. What the API documentation shows is what the agent gets. Fields the CLI adds to a response are forbidden.

One exception, documented in `commands.md`: commands that do not call an API (`schema`) define their own shape in their `--help`.

Three consequences of pass-through:

- Both APIs name their fields in camelCase, but they do not spell everything alike: the Meilisearch API says `apiKey`, the Management API says `apikey`. The CLI does not normalize. An agent reads each API's documentation and gets exactly that.
- A command that filters a list instead of calling a unit route returns the list envelope: `get tasks --ids 42` prints `{"results": [the task], …}`, and the agent reads `results[0]`.
- Some API responses contain secrets by design, for example `apikey` on a Meilisearch Cloud project. They are data the agent needs and they go to stdout unchanged. Redaction applies to stderr, `--debug` traces and logs, not to the data stream.

## Errors

Errors go to stderr, as one JSON document: compact when stderr is not a TTY, indented when it is.

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

- API errors keep the API fields as they are: `code`, `type`, `message`, `link`. The CLI never rewrites an API message.
- `hint` is optional and CLI owned. It names the next command to run. It is a full sentence, without markdown other than backticks around commands. On an unknown command, the hint names the closest existing command, "Did you mean `meili delete indexes`?", computed from the manifest: the CLI suggests, it never asks.
- Errors that come from the CLI itself use codes prefixed with `cli_` and `type` set to `cli`. Current list: `cli_usage`, `cli_config`, `cli_auth_missing`, `cli_timeout`, `cli_network`, `cli_task_failed`, `cli_input_invalid`, `cli_internal`. `cli_internal` is an unexpected error inside the CLI itself, a bug to report, and exits 1. Adding a code is a contract change.
- The Management API does not define an error body in its spec, and the running API answers with `{"error": "Forbidden"}`: a message, no code. For its errors the CLI builds the object itself: `type` is `management`, `code` comes from the HTTP status (`management_unauthorized` 401, `management_forbidden` 403, `management_not_found` 404, `management_unprocessable` 422, `management_error` otherwise), `message` is the API's `error` field when the body has one and the spec's response description otherwise, `link` is absent. When the spec gains an error schema with codes, this rule is replaced by pass-through.
- Stack traces appear only with `--debug`.

## Warnings

A warning is a condition the command goes on through. It goes to stderr as one JSON document in the shape of an error, under `warning` instead of `error`, with a code from the table of this file; the exit code and stdout are not affected. Compact when stderr is not a TTY, indented when it is.

```json
{"warning":{"code":"cli_config","type":"cli","message":"The config file /home/me/.config/meili/config.json is readable by others.","hint":"Run `chmod 600 /home/me/.config/meili/config.json`."}}
```

The CLI warns when the config file is readable by others, see `config.md`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. With `--wait`, the task reached `succeeded`. |
| 1 | API error not covered below, or unexpected error. |
| 2 | Usage error: unknown command, bad or missing flag, flags that call for two different routes, invalid input file. |
| 3 | Authentication or authorization failed: missing API key or token, HTTP 401 or 403 from either API. |
| 4 | Resource not found: HTTP 404 from either API. |
| 5 | Timeout: `--wait` exceeded `--timeout`, or the HTTP request timed out. |
| 6 | Cannot connect: DNS failure, connection refused, TLS error. |
| 7 | Task finished with status `failed` or `canceled` (only with `--wait`). The final task is still printed on stdout. |

No other code is used on purpose. If a new situation needs its own code, add it to this table first.

## Asynchronous operations

Most write operations of the Meilisearch API return a task, not a result. The CLI keeps that model.

- Without `--wait`, the command prints the task the API returned (`taskUid`, `status: "enqueued"`, ...) and exits 0.
- With `--wait`, the command polls `GET /tasks/{uid}` until the status is `succeeded`, `failed` or `canceled`, prints the final task object, and exits with 0 or 7.
- Polling starts at 100 ms and grows to a maximum of 1 s between calls.
- `--timeout` accepts a duration: `500ms`, `30s`, `2m`. Default `60s`. On timeout the CLI prints an error with code `cli_timeout` and exits 5. The task keeps running on the server.
- Progress ("waiting for task 42, status processing") goes to stderr, and only when stderr is a TTY.

## Destructive commands

Destructive commands are those of the verb `delete`, as `commands.md` derives them. No other verb is one: what they write, a later command writes again.

- A command of the verb `delete` requires `--yes`. Without it the command refuses to run, with `cli_usage` and exit 2, before any network call, like any missing required flag.
- `--yes` is a flag, never a question: the CLI does not ask, does not wait and does not read stdin for an answer. No environment variable stands for it, so an environment can never confirm a deletion in the agent's place; the confirmation is in the command line or it does not exist.
- A deletion that needs a selector refuses to run without one: `delete documents --index movies --yes` alone is a usage error, exit 2; `--all` is the explicit way to delete every document.

## Input

- `--file <path>` reads a body from a file. `--file -` reads from stdin. The CLI validates that the content is JSON before it sends anything, and fails with `cli_input_invalid` and exit 2 otherwise.
- `--data <json>` passes a body inline.
- A body-field flag given together with `--file` or `--data` overrides that field in the body. A flag overrides its environment variable the same way.
- The value `null` on a flag sends a JSON null: `--expires-at null`, `--stop-words null`.
- A command never reads stdin unless `--file -` or `--project-api-key -` is given. This avoids hanging when an agent runs it in a pipeline.

## Pagination

- `--limit` and `--offset` (or `--from` for tasks and batches) are passed to the API as they are. When `--id` selects a unit route, they are ignored and not sent.
- `--all` follows the API pagination until the end. With `ndjson` the items stream. With `json` the CLI returns the last page envelope with `results` replaced by the full list and `limit`, `offset` removed.

## Help

- Every command has a `description` of one sentence and at least two `examples`. Every flag has a description of one sentence, and a flag that takes a value documents it with a `helpValue` or a list of options.
- `--help` never makes a network call.
- `meili schema` prints the index: the global flags once, then one entry per command with its `id`, its `description` and its `routes`. It is the cheapest way for an agent to see everything that exists.
- `meili schema --command "get indexes"` prints that one command in full: `id`, `description`, `api`, `routes`, `async`, `keyActions`, its own `flags` and its `examples`. The global flags are not repeated there: they belong to the index. A global flag the command redefines stays, `meili config add --project`, required and with its own description. An unknown `--command` is `cli_usage`, exit 2, with a hint that names `meili schema`.
- Both read the oclif manifest and are always in sync with the code. There is no third level: `oclif.manifest.json` is there for whoever wants everything. See ADR 0008.

## Versioning

- The JSON output shape, the error shape, the exit codes and the command names are the public contract. A breaking change to any of them is a major version.
- A new command, a new flag, a new optional field in a CLI owned response is a minor version.
- Before 1.0, a breaking change is a minor version.
