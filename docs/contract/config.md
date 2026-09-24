# Configuration contract

This file defines how `meili` finds the APIs to talk to and how it treats secrets.

## Principle

An agent must be able to run `meili` with environment variables only, in a fresh container, with no `HOME`. There is no config file: everything comes from a flag or from an environment variable, and a flag and its variable share their name.

## Project connection: resolution order

A project is a Meilisearch instance: the one you run, or a project on Meilisearch Cloud. The CLI needs its URL and, when the instance is protected, one of its API keys.

The CLI resolves `url` and `apiKey` in this order. The first source that provides a value wins, field by field.

1. Flags: `--project-url`, `--project-api-key`
2. Environment variables: `MEILI_PROJECT_URL`, `MEILI_PROJECT_API_KEY`

If no `url` is found, the CLI fails with `cli_config` and exit code 2, and the message names the two ways to provide one. It never falls back to `http://localhost:7700` silently.

`apiKey` is optional. A missing key is not an error at resolution time; the API answers 401 and the CLI exits 3 with a hint.

## Management API connection: resolution order

The credential is a personal access token (PAT), created in the Meilisearch Cloud dashboard and sent as `Authorization: Bearer <token>`.

1. Flag: `--management-token`
2. Environment variable: `MEILI_MANAGEMENT_TOKEN`

If no token is found, the CLI fails before any network call with `cli_auth_missing` and exit code 3. The hint says where to create a token.

The base URL comes from `--management-url`, then `MEILI_MANAGEMENT_URL`, and defaults to `https://api.meilisearch.com`. Every path starts with `/api/v2`. Both management flags arrive with the first management command.

Storing a token on disk, with a `login` command, is a decision of the Management API milestone. It is not in this contract.

## Two APIs, one credential set per command

The Meilisearch API and the Management API use different credentials. A command never needs both.

Every command declares which API it uses with a static property on its class:

```ts
static api = "meilisearch" // or "management", or "none"
```

`BaseCommand` reads this property and:

- resolves only the credentials of that API, using the order above
- builds only that client and passes it to the command
- reports only the missing pieces of that API when resolution fails: an Meilisearch API command without URL exits 2 with `cli_config`, a management command without token exits 3 with `cli_auth_missing`

A command cannot build a client by itself. Commands with `api = "none"` (`schema`) resolve nothing and work offline.

## Environment variables

| Variable | Meaning |
|---|---|
| `MEILI_PROJECT_URL` | Project URL, the Meilisearch instance to talk to. |
| `MEILI_PROJECT_API_KEY` | Project API key. |
| `MEILI_MANAGEMENT_TOKEN` | Management API personal access token. |
| `MEILI_MANAGEMENT_URL` | Management API base URL. Default `https://api.meilisearch.com`. |
| `MEILI_OUTPUT` | Default output mode: `json` or `ndjson`. |
| `MEILI_TIMEOUT` | Default `--timeout` for `--wait`. |

Every variable is documented in `meili --help`. Adding a variable is a contract change.

A variable that doubles a flag takes its name from the flag: `MEILI_` followed by the flag name in upper snake case. `--project-url` and `MEILI_PROJECT_URL`, `--timeout` and `MEILI_TIMEOUT`, `--management-token` and `MEILI_MANAGEMENT_TOKEN`. `MEILI_MANAGEMENT_TOKEN` and `MEILI_MANAGEMENT_URL` get their flags with the first management command. The contract tests check the pairs.

## Secrets

- API keys and tokens never appear on stdout, on stderr, in `--debug` traces, in error messages or in snapshots. When a secret must be shown at all, only its last four characters are: `****1a2b`.
- `--debug` redacts the `Authorization` header and every field named `apiKey`, `apikey`, `key`, `token` in request and response bodies. `apikey` is the Management API's spelling of a project's master key. The redaction lives in `src/lib/config.ts` and is tested.
- The CLI never reads keys from a file. Passing a key in a flag is allowed and documented as visible in the process list.
