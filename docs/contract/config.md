# Configuration contract

This file defines how `meili` finds the instance to talk to, where it stores settings, and how it treats secrets.

## Principle

An agent must be able to run `meili` with environment variables only, in a fresh container, with no config file and no `HOME`. The config file is a convenience for humans who switch between several instances.

## Engine connection: resolution order

The CLI resolves `url` and `apiKey` in this order. The first source that provides a value wins, field by field.

1. Flags: `--url`, `--api-key`
2. Environment variables: `MEILI_URL`, `MEILI_API_KEY`
3. The context named by `--context <name>`, or by `MEILI_CONTEXT` if the flag is absent
4. The default context in the config file

If no `url` is found, the CLI fails with `cli_config` and exit code 2, and the message names the three ways to provide one. It never falls back to `http://localhost:7700` silently.

`apiKey` is optional. A missing key is not an error at resolution time; the API answers 401 and the CLI exits 3 with a hint.

`meili context current` prints the resolved values and the source of each one (`flag`, `env`, `context:<name>`), with the key masked. Use it to debug precedence.

## Management API connection: resolution order

The credential is a personal access token (PAT), created in the Meilisearch Cloud dashboard and sent as `Authorization: Bearer <token>`.

1. Flag: `--management-token`
2. Environment variable: `MEILI_MANAGEMENT_TOKEN`
3. The token stored by `meili management login` in the config file

If no token is found, the CLI fails before any network call with `cli_auth_missing` and exit code 3. The hint names the three sources and says where to create a token.

The base URL comes from `MEILI_MANAGEMENT_URL` and defaults to `https://api.meilisearch.com`. Every path starts with `/api/v2`.

## Two APIs, one credential set per command

The engine API and the management API use different credentials. A command never needs both, with one exception described below.

Every command declares which API it uses with a static property on its class:

```ts
static api = "engine" // or "management", or "none"
```

`BaseCommand` reads this property and:

- resolves only the credentials of that API, using the order above
- builds only that client and passes it to the command
- reports only the missing pieces of that API when resolution fails: an engine command without URL exits 2 with `cli_config`, a management command without token exits 3 with `cli_auth_missing`

A command cannot build a client by itself. Commands with `api = "none"` (`context`, `schema`, `docs`, `completions`) resolve nothing and work offline.

The exception is the global flag `--project <id>` on an engine command (management API milestone). It adds the management API credential to the command, calls `GET /api/v2/projects/{id}`, and injects the project `url` and `apikey` at the context level of the engine resolution order. Explicit `--url`, `--api-key` and the engine environment variables still win.

## Environment variables

| Variable | Meaning |
|---|---|
| `MEILI_URL` | Engine URL. |
| `MEILI_API_KEY` | Engine API key. |
| `MEILI_CONTEXT` | Name of the context to use when `--context` is absent. |
| `MEILI_MANAGEMENT_TOKEN` | Management API personal access token. |
| `MEILI_MANAGEMENT_URL` | Management API base URL. Default `https://api.meilisearch.com`. |
| `MEILI_OUTPUT` | Default output mode: `json`, `ndjson`, `table`. |
| `MEILI_TIMEOUT` | Default `--timeout` for `--wait`. |
| `MEILI_CONFIG_DIR` | Overrides the config directory. |
| `NO_COLOR` | Disables colors when set to any value. |

Every variable is documented in `meili --help` and in `meili docs`. Adding a variable is a contract change.

## Config file

- Location: `$MEILI_CONFIG_DIR/config.json`, else `$XDG_CONFIG_HOME/meili/config.json`, else `~/.config/meili/config.json`. On Windows, the oclif `configDir` for `meili`.
- Format: JSON. Written by the CLI only. Humans can edit it, the CLI validates it on read and fails with `cli_config` and a line number on invalid content.
- The CLI never creates the file on read. Only `meili context add`, `meili context use`, `meili management login` write it.
- If the config directory cannot be determined (no `HOME`, no `XDG_CONFIG_HOME`), the CLI still works with flags and environment variables. Only `context` and `management login` commands fail, with `cli_config`.
- File mode `0600` on POSIX systems, because it contains keys.

```json
{
  "version": 1,
  "defaultContext": "prod",
  "contexts": {
    "prod": {
      "url": "https://ms-abc123.fra.meilisearch.io",
      "apiKey": "..."
    },
    "local": {
      "url": "http://localhost:7700"
    }
  },
  "management": {
    "token": "..."
  }
}
```

`version` allows migrations. A migration runs on read, writes the new file only if the command would write anyway, and prints one line on stderr.

## Secrets

- API keys and tokens never appear on stdout, on stderr, in `--debug` traces, in error messages or in snapshots. `meili context list` shows the last four characters only: `****1a2b`.
- `--debug` redacts the `Authorization` header and every field named `apiKey`, `key`, `token` in request and response bodies. The redaction lives in `src/lib/config.ts` and is tested.
- The CLI never reads keys from a file path given by the user other than the config file. Passing a key in a flag is allowed and documented as visible in the process list.

