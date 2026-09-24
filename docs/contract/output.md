# Output contract

This file defines what `meili` writes, where, and in which format. Agents build on these rules, so a change here is a breaking change and needs a major version.

## Streams

- stdout carries data only. One command, one JSON document (or one NDJSON stream). Nothing else, ever.
- stderr carries everything else: errors, warnings, progress, debug traces, deprecation notices.
- A command that produces no data (for example `meili context use`) writes nothing on stdout in `json` mode and exits with code 0. It may write one line on stderr when stderr is a TTY.

## Output modes

`--output <mode>` selects the mode. `MEILI_OUTPUT` sets the default. Without either, the mode is `json` when stdout is not a TTY and `table` when it is.

| Mode | Rule |
|---|---|
| `json` | One JSON document. Compact (one line) when stdout is not a TTY, indented with two spaces when it is. Field order and names are the API's. |
| `ndjson` | One JSON object per line. Only list commands support it. Each line is one item of the API `results` array. With `--all`, lines stream as pages arrive. |
| `table` | Human readable. Not a contract: columns and layout can change in a minor version. Never parse it. |

Colors appear only when the stream is a TTY and `NO_COLOR` is not set.

## Pass-through

The CLI returns the API response body without a wrapper and without renaming. What the API documentation shows is what the agent gets. Fields the CLI adds to a response are forbidden.

Two exceptions, both documented in `commands.md`:

- `meili document add` on a large file returns an array of tasks, one per batch.
- Commands that do not call an API (`context`, `schema`, `docs`) define their own shape in their `--help`.

Two consequences of pass-through:

- The two APIs name fields differently: camelCase for the engine API (`indexUid`), snake_case for the management API (`team_id`). The CLI does not normalize. An agent reads each API's documentation and gets exactly that.
- Some API responses contain secrets by design, for example `apikey` on a Meilisearch Cloud project. They are data the agent needs and they go to stdout unchanged. Redaction applies to stderr, `--debug` traces and logs, not to the data stream.

## Errors

Errors go to stderr. In `json` and `ndjson` modes the error is one JSON document. In `table` mode it is a short text with the same information.

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

- API errors keep the API fields as they are: `code`, `type`, `message`, `link`. The CLI never rewrites an API message.
- `hint` is optional and CLI owned. It names the next command to run. It is a full sentence, without markdown other than backticks around commands.
- Errors that come from the CLI itself use codes prefixed with `cli_` and `type` set to `cli`. Current list: `cli_usage`, `cli_config`, `cli_auth_missing`, `cli_confirmation_required`, `cli_timeout`, `cli_network`, `cli_task_failed`, `cli_input_invalid`, `cli_internal`. `cli_internal` is an unexpected error inside the CLI itself, a bug to report, and exits 1. Adding a code is a contract change.
- The management API does not define an error body in its spec. For its errors the CLI builds the object itself: `type` is `management`, `code` comes from the HTTP status (`management_unauthorized` 401, `management_forbidden` 403, `management_not_found` 404, `management_unprocessable` 422, `management_error` otherwise), `message` is the body message when the API sends one and the spec's response description otherwise, `link` is absent. When the spec gains an error schema, this rule is replaced by pass-through.
- Stack traces appear only with `--debug`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. With `--wait`, the task reached `succeeded`. |
| 1 | API error not covered below, or unexpected error. |
| 2 | Usage error: unknown command, bad flag, missing argument, invalid input file. |
| 3 | Authentication or authorization failed: missing API key or token, HTTP 401 or 403 from either API. |
| 4 | Resource not found: HTTP 404 from either API, unknown context name. |
| 5 | Timeout: `--wait` exceeded `--timeout`, or the HTTP request timed out. |
| 6 | Cannot connect: DNS failure, connection refused, TLS error. |
| 7 | Confirmation required: destructive command without `--yes` while stdin is not a TTY. |
| 8 | Task finished with status `failed` or `canceled` (only with `--wait` or `meili task wait`). The final task is still printed on stdout. |

No other code is used on purpose. If a new situation needs its own code, add it to this table first.

## Asynchronous operations

Most engine write operations return a task, not a result. The CLI keeps that model.

- Without `--wait`, the command prints the task the API returned (`taskUid`, `status: "enqueued"`, ...) and exits 0.
- With `--wait`, the command polls `GET /tasks/{uid}` until the status is `succeeded`, `failed` or `canceled`, prints the final task object, and exits with 0 or 8.
- Polling starts at 100 ms and grows to a maximum of 1 s between calls.
- `--timeout` accepts a duration: `500ms`, `30s`, `2m`. Default `60s`. On timeout the CLI prints an error with code `cli_timeout` and exits 5. The task keeps running on the server.
- Progress ("waiting for task 42, status processing") goes to stderr, and only when stderr is a TTY.

## Destructive commands

`delete`, `delete-all`, `reset`, `swap`, `remove`, `cancel` are destructive.

- When stdin is a TTY and `--yes` is absent, the CLI asks one yes/no question on stderr. Any answer other than `y` or `yes` aborts with exit code 7.
- When stdin is not a TTY, `--yes` is mandatory. Without it the CLI does not call the API and exits 7 with code `cli_confirmation_required`.
- Commands that support `--dry-run` print what they would do on stdout, in the selected mode, and exit 0 without calling any write route.

## Input

- `--file <path>` reads a body from a file. `--file -` reads from stdin. The CLI validates that the content is JSON (or NDJSON, CSV where the command allows it) before it sends anything, and fails with `cli_input_invalid` and exit 2 otherwise.
- `--data <json>` passes a body inline.
- A command never reads stdin unless `--file -` is given. This avoids hanging when an agent runs it in a pipeline.

## Pagination

- `--limit` and `--offset` (or `--from` for tasks and batches) are passed to the API as they are.
- `--all` follows the API pagination until the end. With `ndjson` the items stream. With `json` the CLI returns the last page envelope with `results` replaced by the full list and `limit`, `offset` removed. With `table` it prints one table.

## Help

- Every command has a `description` of one sentence and at least two `examples`.
- `--help` never makes a network call.
- `meili schema` prints the same information as JSON for every command. It reads the oclif manifest and is always in sync with the code.

## Versioning

- The JSON output shape, the error shape, the exit codes and the command names are the public contract. A breaking change to any of them is a major version.
- A new command, a new flag, a new optional field in a CLI owned response is a minor version.
- The `table` mode is not part of the contract.
