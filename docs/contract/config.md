# Configuration contract

This file defines how `meili` finds the APIs it talks to, and how it handles secrets.

## Principle

An agent must be able to run a Meilisearch command from the command line alone: in a new container, with no config file and no `HOME`. A management command needs the session that a human logged in with, see "Management API connection". The config file is for people who set up their projects once. The CLI never deduces anything from it: every command names its project on the command line, or fails and says how to name one. The CLI calls the Management API only when the command line asks for it, never to resolve the target of a command.

## Projects

A project is a Meilisearch instance: one you run yourself, or a project on Meilisearch Cloud. A Meilisearch command needs its URL and, when the instance is protected, one of its API keys. A management command needs its id in Meilisearch Cloud, see "Cloud projects". A project comes from the command line only, in one of two ways:

1. `--project-url <url>` and `--project-api-key <key>`
2. `--project <name>`, an entry of the config file

A human writes the projects in the config file. An agent names one with `--project`, from the file it was given. Or the agent receives a URL and a key and passes them as flags. No environment variable stands for a project. A variable is set once and then silently chooses the target of every later command, which is a deduction.

## Config file

The path is `$MEILI_CONFIG` if set, else `$XDG_CONFIG_HOME/meili/config.json`, else `~/.config/meili/config.json`. The file is JSON. A human writes it by hand, or with `meili config set`:

```json
{
  "projects": {
    "local": { "url": "http://localhost:7700" },
    "prod": { "url": "https://ms-abc.sfo.meilisearch.io", "apiKey": "…", "cloud": { "id": 343, "teamId": 12, "teamName": "Search" } }
  }
}
```

- `url` is required. `apiKey` and `cloud` are optional. `cloud` holds the identifiers of the project in Meilisearch Cloud: `id`, an integer, required; `teamId`, an integer, optional; `teamName`, a string, optional. The CLI writes `cloud` from the Management API, see "Cloud projects". `teamId` and `teamName` are for the person who reads the file; no command reads them. The file holds nothing else: no current project, no default entry.
- The file holds API keys, so it belongs to one user, and only that user can read it: mode `600`, or `400` for a file that an agent must not change. When others can read the file, the CLI writes a warning on stderr with the `chmod` command to run (`output.md`, "Warnings"), and continues. On Windows, file modes do not exist, so there is no check. A missing file is not an error: the CLI behaves as if there were no file.
- Invalid JSON, or a shape other than the one above, fails with `cli_config` and the path of the file.
- The file is shared state: whoever writes it affects every process that reads it. Give an agent its own file through `MEILI_CONFIG`. A human prepares that file and mounts it read-only in the agent's sandbox. Never give the agent the human's file. An agent adds, removes or changes a project, or changes the permissions of the file, only when the human explicitly asked for it: the file decides where every later command goes, for every process that reads it. `meili --help`, the help of the `config` commands and `meili schema` say so.
- `meili config list`, `meili config set`, `meili config update`, `meili config unset` and `meili config sync-with-cloud` manage the file, see `commands.md`. `config set` refuses a name that already exists. `config update` refuses a name that does not exist. Each command does one thing.

## Resolution: the command line names the project

The CLI resolves the project of a command with the rules below, in this order. It stops at the first rule that applies.

1. **`--project-url`** gives the URL. A URL that is not HTTP(S), including an empty one, is `cli_usage`, exit 2. The key comes from `--project-api-key`, or there is no key. The CLI does not read the file for the key, so a configured key never goes to a URL it was not configured with. `--project` together with `--project-url` is a `cli_usage` error, exit 2: the name and the URL contradict each other.
2. **`--project <name>`** gives the entry of the config file. No file, or no entry with this name, is `cli_config`, with the path and the names that the file has. `--project-api-key` replaces the key of the entry.
3. **Neither flag** is a `cli_usage` error, exit 2. The error names `--project` and `--project-url`, with a hint to `meili config list`. The CLI does not read the file to choose a project: a file with one project is not a default, and `--project-api-key` alone names no project.

`meili export` uses two projects. The source is resolved by the rules above. The destination is the project that the export sends the data to. The destination is never resolved from the ambient sources. It is `--url` with `--api-key`, or `--project-destination <name>`, an entry of the config file. The URL and key of that entry become the `url` and `apiKey` of the body. `--project-destination` with `--url` is `cli_usage`, exit 2. A name that the file does not have is `cli_config`, as for `--project`. `--api-key` replaces the key of the entry. As everywhere else, the key of the entry goes only with the URL of that entry. See ADR 0012.

A missing key is not an error at resolution time. The API answers 401, and the CLI exits 3 with a hint. The CLI never silently falls back to `http://localhost:7700`.

## Cloud projects

A management command acts on a project of Meilisearch Cloud. The project is identified by its integer `id`: `meili update projects --id 343`. The Cloud dashboard does not show the id, so the config file stores it as `cloud.id`, and `--project <name>` passes it to the command: `meili update projects --project prod --name renamed`. See ADR 0011.

- `--project` and `--id` together are a `cli_usage` error, exit 2: the name and the id contradict each other. Giving neither flag is also `cli_usage`.
- An entry without `cloud` is a `cli_config` error, exit 2, "Project `<name>` has no cloud identifiers", with a hint to `meili config update --project <name> --sync-with-cloud`. When a command runs, the CLI never finds the id by itself, from the URL or in any other way.
- A management command that does not act on a project, `add projects`, does not offer `--project` at all. The flag is not silently ignored there: it does not exist.

### Writing `cloud`

`cloud` is never typed on the command line. The CLI writes it from the Management API, and only when the command line asks for it. Four requests do this:

1. `meili config sync-with-cloud (--all | --team-ids <ids> | --project-name <name> | --project-url <url>)`: every Cloud project of the scope gets an entry, see below.
2. `meili config set --project <name> --project-url <url> --sync-with-cloud`: the new entry is the Cloud project whose URL is `<url>`, with the same scheme and host.
3. `meili config update --project <name> --sync-with-cloud`: the entry is synced with its project. This is the project of its `cloud.id`, else the project of its URL, after the other flags are applied to the URL.
4. `--sync-config` on the project commands. `meili add projects … --sync-config` adds the created project as an entry with the project's name, its URL, its master key as `apiKey`, and its `cloud`. `meili update projects … --name <name> --sync-config` renames the project's entry to the new name and refreshes its `cloud`. `meili delete projects … --sync-config` removes the entry. The entry is the one that `--project` names, or else the one whose `cloud.id` is `--id`. These cases are an error before the call: no entry, several entries, a missing `--name` on `update`, or a new name that the file already has. In that case nothing is sent. The file is written only after the API has answered. On `add`, a name that the file already has is a `cli_config` error before the project is created.

The same rules apply to all four:

- **The key.** The CLI writes the project's master key, `GET /api/v2/projects/{projectId}/master-key`, only into an entry without `apiKey`. It never replaces a key that the file has or that `--project-api-key` gives. The API returns the master key only to the owners of the project's team or organization. On a 403, the CLI writes the entry without a key, writes a warning that names the project with the hint "Ask an owner of the team for a key, then run `meili config update --project <name> --project-api-key -`.", and continues.
- **The team.** `teamId` is the project's team id. `teamName` comes from `GET /api/v2/teams`. When the CLI cannot read the name, it writes `cloud` without the name, with a warning.
- **No match.** `config set` and `config update` with `--sync-with-cloud`, and `sync-with-cloud --project-url` or `--project-name`, fail with `cli_config` when no Cloud project matches. They write nothing, not even the entry of `config set`.
- **One write.** The CLI writes the file once, after every call has answered. Only two errors let the command continue: a 403 on the master key, and a team name that cannot be read. Any other error, such as a 401, a network error or a 5xx, leaves the file unchanged.
- **Credentials.** These requests resolve the Management API connection like any management command, see below. Without `--sync-with-cloud`, `config set` and `config update` resolve nothing and work offline.

### `config sync-with-cloud`

The command takes exactly one scope flag. Otherwise it fails with `cli_usage`, exit 2:

| Flag | Projects | Calls |
|---|---|---|
| `--all` | every project the token can see | `GET /api/v2/projects`, every page |
| `--team-ids <ids>` | the projects of these teams | `GET /api/v2/projects?teamId=<id>`, every page, once per team |
| `--project-name <name>` | the projects named exactly `<name>`, with the same case, in any team | `GET /api/v2/projects`, every page, filtered by the CLI |
| `--project-url <url>` | the project whose URL is `<url>`, with the same scheme and host | `GET /api/v2/projects`, every page, filtered by the CLI |

For each project of the scope:

- A project whose `url` is `null` is still being created. The CLI skips it, with a `cli_config` warning.
- **The existing entry** of a project is the entry whose `cloud.id` is the project's `id`. Else it is the entry without `cloud` whose `url` has the project's scheme and host. Two such entries without `cloud` are a `cli_config` error: the CLI does not pick one. The existing entry gets `cloud` and, if it has no key, the master key. Its name and its URL do not change. If its URL is not the project's URL, this is an anomaly: the CLI reports it with a `cli_config` warning and does not correct it.
- **A project without an entry** gets a new entry, with the project's name, its URL, its master key and its `cloud`. Sometimes that name is already taken, by another new entry of the same run or by an entry of another project. Then every new entry with that name is named `<name>-<id>`, with a `cli_config` warning that gives the chosen name. If the file already has an entry with the suffixed name, this is `cli_config`, and nothing is written.

Entries whose project is not in the scope, or is no longer in the Cloud, stay unchanged and are not reported.

On stdout, the command prints one item per project of the scope that has an entry, in the order of the API. `ndjson` prints one item per line.

```json
[
  { "project": "prod", "cloud": { "id": 343, "teamId": 12, "teamName": "Search" }, "action": "unchanged", "apiKey": "kept" },
  { "project": "prod-351", "cloud": { "id": 351, "teamId": 13, "teamName": "Docs" }, "action": "added", "apiKey": "missing" }
]
```

`project` is the name of the entry. `action` is `added`, `updated` when a field of the entry changed, or `unchanged`. `apiKey` is `written`, `kept`, or `missing` when the entry has no key and the CLI could not read the master key. The key itself is never printed. The command exits 0 when the file is written, with or without warnings.

## Management API connection: resolution order

The credential is a bearer token, sent as `Authorization: Bearer <token>`. It is the OAuth access token of `meili auth login`, or, for development, `MEILI_MANAGEMENT_TOKEN`. A human logs in once. An agent uses the session that a human logged in with, next to the config file the agent was given.

1. Environment variable: `MEILI_MANAGEMENT_TOKEN`, a personal access token, for development and for tests against another Cloud. Today, only an administrator can create one in the dashboard, so users cannot use it to log in, and no flag stands for it.
2. The session of `meili auth login`, in the credentials file below

If the CLI finds neither, it fails before any network call with `cli_auth_missing` and exit code 3, with a hint to `meili auth login`. A 401 from the API also gives a hint to `meili auth login`. When `MEILI_MANAGEMENT_TOKEN` is set, the hint says to unset or replace it instead, because a new login would not replace it. A 403 has no hint: the account lacks a right, and no credential can grant it.

The base URL is the URL of the Cloud that issued the session. With `MEILI_MANAGEMENT_TOKEN`, the base URL is `MEILI_MANAGEMENT_URL`, for development and tests, with the default `https://api.meilisearch.com`. With a session, `MEILI_MANAGEMENT_URL` must name the Cloud that issued the session, see below. No flag stands for it. Every path starts with `/api/v2`. The URL must be HTTPS, unless its host is `localhost`, `127.0.0.1` or `::1`. Any other URL would send the token unencrypted, and is `cli_usage` before any network call.

## The credentials file

`meili auth login` runs the OAuth2 authorization code flow with PKCE against Meilisearch Cloud (ADR 0009). It writes the result to `credentials.json`, next to the config file. `MEILI_CONFIG` moves both files, so an agent that has its own config file has its own session, or no session at all.

```json
{
  "clientId": "meilisearch-cli",
  "managementUrl": "https://api.meilisearch.com",
  "dashboardUrl": "https://cloud.meilisearch.com",
  "accessToken": "…",
  "refreshToken": "…",
  "expiresAt": "2026-10-20T21:00:00.000Z",
  "scope": "read write"
}
```

- The CLI writes the file atomically and readable by its owner only, mode `600`, like the config file. When others can read it, the CLI writes a warning on stderr and continues.
- The file stores the URLs and the client id with the tokens. A later command can then refresh and revoke the tokens against the Cloud that issued them, without a flag.
- An access token is valid for one hour. When the token of a management command has expired, or is about to expire, the command exchanges the refresh token for a new pair of tokens and writes it to the file before it calls the API. `meili auth refresh` does the same on demand, before the old token expires. A session without a refresh token, or whose refresh is refused, is `cli_auth_failed` and exit 3, with a hint to log in again.
- `meili auth logout` revokes both tokens of the session at the authorization server, each with its `token_type_hint`, and removes the file. When the revocation fails, the CLI still removes the file, and the command exits with the code of what failed, see below. The local session is gone in both cases, but a token that is still valid somewhere must not be reported as a success.
- Only `auth login` and the refresh above write this file. It is the only place on disk where the CLI reads a token.
- The default client id is `meilisearch-cli`, the OAuth application of this CLI. Every Cloud registers it with this id, so the default applies to every Cloud, Meilisearch Cloud or another one (ADR 0014). `MEILI_MANAGEMENT_CLIENT_ID` replaces it, for development and tests. A client id is public by definition: it is the name that the consent page shows, not a secret. The CLI holds no secret for it.
- The consent URL carries `prompt=create`. A human without a session on the dashboard lands on the sign-up page, which links to the login page. A human with a session goes straight to the consent page. So `auth login` also creates an account.
- The two URLs, `MEILI_MANAGEMENT_URL` and `MEILI_MANAGEMENT_DASHBOARD_URL`, name the same Cloud and must be set together. One without the other is `cli_usage`: otherwise the human would approve on one Cloud and the code would be exchanged on another. When neither is set, the CLI uses Meilisearch Cloud. This is what a user of the published CLI does: set nothing.
- Every URL of the flow must be HTTPS, unless its host is `localhost`, `127.0.0.1` or `::1`, where nothing leaves the machine. Any other URL would send the token unencrypted. Such a URL is `cli_usage`.
- A session names the Cloud that issued it. A `MEILI_MANAGEMENT_URL` that names another Cloud is `cli_config`: the CLI never sends a token to a Cloud that did not issue it. Log in again against that URL, or unset the variable.
- `auth logout` exits 0 when the revocation succeeded. Otherwise it exits with the code of what failed, `cli_network` or `cli_auth_failed`. In both cases the file is removed, so the message says that the token stays valid until it expires.

## Two APIs, one credential set per command

The Meilisearch API and the Management API use different credentials. A command never needs both.

Every command declares which API it uses with a static property on its class:

```ts
static api = "meilisearch" // or "management", or "none"
```

`BaseCommand` reads this property and:

- resolves only the credentials of that API, with the rules above
- builds only that client and passes it to the command
- reports only the missing parts of that API when resolution fails: a Meilisearch API command without a project exits 2 with `cli_usage`, a management command without a token exits 3 with `cli_auth_missing`

A command cannot build a client by itself. Commands with `api = "none"` (`schema`, the `config` commands) resolve nothing and work offline. There are two explicit exceptions. `config sync-with-cloud` declares `api = "management"` and has no route of its own. `config set` and `config update` resolve the Management API connection only when `--sync-with-cloud` is given.

## Environment variables

| Variable | Meaning |
|---|---|
| `MEILI_CONFIG` | Config file path. Default `~/.config/meili/config.json`. Give each agent its own file, read-only. |
| `MEILI_MANAGEMENT_TOKEN` | Management API token, used instead of the session of `auth login`. For development and tests. |
| `MEILI_MANAGEMENT_URL` | Management API base URL. Default `https://api.meilisearch.com`. For development and tests. |
| `MEILI_MANAGEMENT_CLIENT_ID` | OAuth application that the `auth login` command uses to identify itself. Default: `meilisearch-cli`, the application of this CLI. For development and tests. |
| `MEILI_MANAGEMENT_DASHBOARD_URL` | Dashboard URL, which hosts the consent page of `auth login`. Default `https://cloud.meilisearch.com`. For development and tests. |
| `MEILI_OUTPUT` | Default output mode: `json` or `ndjson`. |
| `MEILI_TIMEOUT` | Default `--timeout` for `--wait`. |

`meili --help` documents every variable. Adding a variable is a contract change.

A variable that has the same role as a flag takes its name from the flag: `MEILI_` followed by the flag name in upper snake case. For example `--output` and `MEILI_OUTPUT`, `--timeout` and `MEILI_TIMEOUT`. Some variables and flags have no pair:

- `MEILI_CONFIG` has no flag, because the file is chosen per process.
- The `MEILI_MANAGEMENT_*` variables have no flag. They are for development and tests, against another Cloud or with a token instead of the session.
- The project flags, `--project`, `--project-url` and `--project-api-key`, have no variable, because a project is chosen per command.

The contract tests check the pairs.

## Secrets

- The CLI holds credentials to reach an API: the keys of the config file and the tokens of the credentials file. These credentials never appear on stdout, on stderr, in `--debug` traces, in error messages or in snapshots. When the CLI must show one, it shows only the last four characters: `****1a2b`. `meili config list` masks keys in the same way.
- A credential that an API *returns* is data, not one of these credentials. The `keys` commands print the `key` field as the API returns it, like every field of every other response (`output.md`, Pass-through). One exception: `add projects` masks the `masterKey` of the project it creates. Nobody runs that command to read this key, unlike `get keys`. `--sync-config`, or `config sync-with-cloud` later, writes the key to the config file without printing it (ADR 0013). Otherwise, the CLI hides nothing from the agent it works for. Redaction applies to the credentials the CLI holds, in the headers and body fields that the next bullet lists, never to the data stream. A credential that the agent passes itself goes where its route puts it. `get keys --id <key value>` puts the key in the request path, so a `--debug` trace prints it there. This exposes the key no more than before: it is already visible in the process list.
- `--debug` redacts the `Authorization`, `Cookie` and `Set-Cookie` headers, because a session cookie of the authorization server is a credential like any other. It also redacts every field named `apiKey`, `apikey`, `masterKey`, `key`, `token`, `access_token`, `refresh_token` in request and response bodies. `apikey` is how the Management API spells the master key of a project. `masterKey` is how the same API spells the same key when it returns a project. `access_token` and `refresh_token` are how the authorization server spells its tokens. A form-encoded body, the format the token endpoint takes, is never printed. The redaction lives in `src/lib/config.ts` and is tested.
- The CLI reads keys from the config file, and from nowhere else on disk. It warns when others can read the file. Passing a key in a flag is allowed. The documentation says that the key is then visible in the process list and in the shell history. `--project-api-key -` reads the key from stdin instead.
