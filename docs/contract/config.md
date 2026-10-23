# Configuration contract

This file defines how `meili` finds the APIs to talk to and how it treats secrets.

## Principle

An agent must be able to run `meili` with environment variables only, in a fresh container, with no `HOME`. A config file exists for the people and the agents who work with several projects, and nothing is ever deduced from it: a project is named on the command line, or there is exactly one to choose from, or the command fails and says what it found.

## Projects

A project is a Meilisearch instance: the one you run, or a project on Meilisearch Cloud. The CLI needs its URL and, when the instance is protected, one of its API keys. A project comes from one of three sources:

1. the command line: `--project-url <url>` and `--project-api-key <key>`, or `--project <name>`, an entry of the config file
2. the environment: `MEILI_PROJECT_URL` and `MEILI_PROJECT_API_KEY`
3. the config file

## Config file

The path is `$MEILI_CONFIG` if set, else `$XDG_CONFIG_HOME/meili/config.json`, else `~/.config/meili/config.json`. The file is JSON, written by hand or by `meili config set`:

```json
{
  "projects": {
    "local": { "url": "http://localhost:7700" },
    "prod": { "url": "https://ms-abc.sfo.meilisearch.io", "apiKey": "…" }
  }
}
```

- `url` is required, `apiKey` is optional. Nothing else: no current project, no default entry.
- The file holds API keys, so it belongs to one user and is readable by that user alone: mode `600`, or `400` for a file an agent must not change. When the file is readable by others, the CLI warns on stderr with the `chmod` to run (`output.md`, "Warnings") and goes on. On Windows, where file modes do not exist, there is no check. A file that does not exist is not an error: the CLI behaves as if there were no file.
- Invalid JSON, or a shape other than the one above, fails with `cli_config` and the path of the file.
- The file is shared state: every process that reads it is affected by whoever writes it. Give an agent its own file through `MEILI_CONFIG`, prepared by a human and mounted read-only in its sandbox, never the human's file. An agent adds, removes or changes a project, or the permissions of the file, only when the human asked for it explicitly: the file decides where every later command goes, for every process that reads it. `meili --help`, the help of the `config` commands and `meili schema` say so.
- `meili config list`, `meili config set` and `meili config unset` manage the file, see `commands.md`. `config set` refuses a name that already exists: changing an entry is an `unset` then a `set`, on purpose.

## Resolution: nothing is deduced

The CLI resolves the project of a command in this order, and stops at the first rule that applies.

1. **`--project-url`** gives the URL. The key comes from `--project-api-key`, or there is none: the environment and the file are not read for it, so that a configured key never travels to a URL it was not configured with. `--project` together with `--project-url` is a `cli_usage` error, exit 2: the name and the URL contradict each other.
2. **`--project <name>`** gives the entry of the config file. No file, or no such name, is `cli_config` with the path and the names the file has. `--project-api-key` replaces the key of the entry.
3. **Neither flag**: the ambient sources must define exactly one project.
   - the environment pair alone, `MEILI_PROJECT_URL` with or without `MEILI_PROJECT_API_KEY`: that project;
   - the file alone, with a single project: that project;
   - the file alone, with several projects: `cli_config`, "Pick a project with `--project`", followed by the names;
   - the environment pair and a file that has projects: `cli_config`, naming both, because two sources define a project and the CLI does not rank them;
   - nothing: `cli_config`, naming the three ways to provide a project.

   `--project-api-key` alone replaces the key of that single project.

A missing key is not an error at resolution time; the API answers 401 and the CLI exits 3 with a hint. The CLI never falls back to `http://localhost:7700` silently.

## Management API connection: resolution order

The credential is a bearer token: either a personal access token (PAT) created in the Meilisearch Cloud dashboard, or the OAuth access token of `meili auth login`. The API takes both, on the same header, `Authorization: Bearer <token>`.

1. Flag: `--management-token`
2. Environment variable: `MEILI_MANAGEMENT_TOKEN`
3. The session of `meili auth login`, in the credentials file below

If nothing is found, the CLI fails before any network call with `cli_auth_missing` and exit code 3. The hint names both ways in.

The base URL comes from `--management-url`, then `MEILI_MANAGEMENT_URL`, and defaults to `https://api.meilisearch.com`. Every path starts with `/api/v2`. `--management-token` arrives with the first management command; `--management-url` already exists on `meili auth login`.

## The credentials file

`meili auth login` runs the OAuth2 authorization code flow with PKCE against Meilisearch Cloud (ADR 0009) and writes what it gets to `credentials.json`, next to the config file: `MEILI_CONFIG` moves both, so an agent given its own config file has its own session or none at all.

```json
{
  "clientId": "0sZKkuuaL3xcitNgKUchid3Vz4sHPslxQNFn_d_9rck",
  "managementUrl": "https://api.meilisearch.com",
  "dashboardUrl": "https://cloud.meilisearch.com",
  "accessToken": "…",
  "refreshToken": "…",
  "expiresAt": "2026-10-20T21:00:00.000Z",
  "scope": "read write"
}
```

- The file is written owner-only, mode `600`, atomically, like the config file. When it is readable by others the CLI warns on stderr and goes on.
- The URLs and the client id are stored with the tokens, so a later command refreshes and revokes against the Cloud that issued them, without a flag.
- An access token lives one hour. A management command whose token is expired, or about to be, trades the refresh token for a new pair and writes it back before calling the API; `meili auth refresh` does the same on demand, before the old one is spent. A session without a refresh token, or whose refresh is refused, is `cli_auth_failed` and exit 3, with a hint to log in again.
- `meili auth logout` revokes both tokens of the session at the authorization server, each with its `token_type_hint`, and removes the file. When the revocation does not go through, the file is removed anyway and the command exits with the code of what failed, see below: the local session is gone either way, but a live token out there is not something to report as success.
- `auth login` and the refresh above are the only writers of this file, and it is the only place on disk the CLI reads a token from.
- The client id defaults to `0sZKkuuaL3xcitNgKUchid3Vz4sHPslxQNFn_d_9rck`, the OAuth application of this CLI on Meilisearch Cloud. A client id is public by definition: it is the name the consent page shows, not a secret, and the CLI holds none. An application belongs to the Cloud that registered it, so the two URLs below move the default away: name another Cloud and `--management-client-id` names its application, a missing one being `cli_usage`, exit 2, like any missing flag.
- The two URLs name the same Cloud and travel together: one without the other is `cli_usage`, because the human would approve on one Cloud and the code would be exchanged on another. Neither of them means Meilisearch Cloud, which is what a user of the published CLI gives: nothing.
- Every URL of the flow must be HTTPS, unless its host is `localhost`, `127.0.0.1` or `::1`, where nothing leaves the machine: anything else would send the token in the clear. A URL that is neither is `cli_usage`.
- A session names the Cloud that issued it. A `MEILI_MANAGEMENT_URL` that names another one is `cli_config`: a token is never sent to a Cloud that did not issue it. Log in again against that URL, or unset the variable.
- `auth logout` exits 0 when the revocation went through, and with the code of what failed otherwise, `cli_network` or `cli_auth_failed`; either way the file is gone, so the message says the token stays valid until it expires.

## Two APIs, one credential set per command

The Meilisearch API and the Management API use different credentials. A command never needs both.

Every command declares which API it uses with a static property on its class:

```ts
static api = "meilisearch" // or "management", or "none"
```

`BaseCommand` reads this property and:

- resolves only the credentials of that API, using the rules above
- builds only that client and passes it to the command
- reports only the missing pieces of that API when resolution fails: a Meilisearch API command without project exits 2 with `cli_config`, a management command without token exits 3 with `cli_auth_missing`

A command cannot build a client by itself. Commands with `api = "none"` (`schema`, the `config` commands) resolve nothing and work offline.

## Environment variables

| Variable | Meaning |
|---|---|
| `MEILI_PROJECT_URL` | Project URL, the Meilisearch instance to talk to. |
| `MEILI_PROJECT_API_KEY` | Project API key. |
| `MEILI_CONFIG` | Config file path. Default `~/.config/meili/config.json`. Give each agent its own file, read-only. |
| `MEILI_MANAGEMENT_TOKEN` | Management API personal access token. |
| `MEILI_MANAGEMENT_URL` | Management API base URL. Default `https://api.meilisearch.com`. |
| `MEILI_MANAGEMENT_CLIENT_ID` | OAuth application the `auth login` command identifies itself with. Default: the one of this CLI on Meilisearch Cloud. |
| `MEILI_MANAGEMENT_DASHBOARD_URL` | Dashboard URL, which hosts the consent page of `auth login`. Default `https://cloud.meilisearch.com`. |
| `MEILI_OUTPUT` | Default output mode: `json` or `ndjson`. |
| `MEILI_TIMEOUT` | Default `--timeout` for `--wait`. |

Every variable is documented in `meili --help`. Adding a variable is a contract change.

A variable that doubles a flag takes its name from the flag: `MEILI_` followed by the flag name in upper snake case. `--project-url` and `MEILI_PROJECT_URL`, `--timeout` and `MEILI_TIMEOUT`, `--management-token` and `MEILI_MANAGEMENT_TOKEN`. `MEILI_MANAGEMENT_TOKEN` and `MEILI_MANAGEMENT_URL` get their flags with the first management command. `MEILI_CONFIG` has no flag, the file is chosen per process, and `--project` has no variable, a project is chosen per command. The contract tests check the pairs.

## Secrets

- API keys and tokens never appear on stdout, on stderr, in `--debug` traces, in error messages or in snapshots. When a secret must be shown at all, only its last four characters are: `****1a2b`. `meili config list` masks keys the same way.
- `--debug` redacts the `Authorization`, `Cookie` and `Set-Cookie` headers, a session cookie of the authorization server being a credential like any other, and every field named `apiKey`, `apikey`, `key`, `token`, `access_token`, `refresh_token` in request and response bodies. `apikey` is the Management API's spelling of a project's master key, `access_token` and `refresh_token` the spelling of the authorization server. A form-encoded body, which is what the token endpoint takes, is never printed. The redaction lives in `src/lib/config.ts` and is tested.
- The CLI reads keys from the config file, and from nowhere else on disk, and warns when the file is readable by others. Passing a key in a flag is allowed and documented as visible in the process list and in the shell history; `--project-api-key -` reads it from stdin instead.
