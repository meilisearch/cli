# Configuration contract

This file defines how `meili` finds the APIs to talk to and how it treats secrets.

## Principle

An agent must be able to run `meili` with environment variables only, in a fresh container, with no `HOME`. A config file exists for the people and the agents who work with several projects, and nothing is ever deduced from it: a project is named on the command line, or there is exactly one to choose from, or the command fails and says what it found. The Management API is consulted only when the command line asks for it, never to resolve the target of a command.

## Projects

A project is a Meilisearch instance: the one you run, or a project on Meilisearch Cloud. A Meilisearch command needs its URL and, when the instance is protected, one of its API keys; a management command needs its id in Meilisearch Cloud, see "Cloud projects". A project comes from one of three sources:

1. the command line: `--project-url <url>` and `--project-api-key <key>`, or `--project <name>`, an entry of the config file
2. the environment: `MEILI_PROJECT_URL` and `MEILI_PROJECT_API_KEY`
3. the config file

## Config file

The path is `$MEILI_CONFIG` if set, else `$XDG_CONFIG_HOME/meili/config.json`, else `~/.config/meili/config.json`. The file is JSON, written by hand or by `meili config add`:

```json
{
  "projects": {
    "local": { "url": "http://localhost:7700" },
    "prod": { "url": "https://ms-abc.sfo.meilisearch.io", "apiKey": "…", "cloudId": 343 }
  }
}
```

- `url` is required, `apiKey` and `cloudId` are optional. `cloudId` is the project's `id` in Meilisearch Cloud, an integer. Nothing else: no current project, no default entry.
- The file holds API keys, so it belongs to one user and is readable by that user alone: mode `600`, or `400` for a file an agent must not change. When the file is readable by others, the CLI warns on stderr with the `chmod` to run (`output.md`, "Warnings") and goes on. On Windows, where file modes do not exist, there is no check. A file that does not exist is not an error: the CLI behaves as if there were no file.
- Invalid JSON, or a shape other than the one above, fails with `cli_config` and the path of the file.
- The file is shared state: every process that reads it is affected by whoever writes it. Give an agent its own file through `MEILI_CONFIG`, prepared by a human and mounted read-only in its sandbox, never the human's file. An agent adds, removes or changes a project, or the permissions of the file, only when the human asked for it explicitly: the file decides where every later command goes, for every process that reads it. `meili --help`, the help of the `config` commands and `meili schema` say so.
- `meili config list`, `meili config add`, `meili config update`, `meili config remove` and `meili config sync-with-cloud` manage the file, see `commands.md`. `config add` refuses a name that already exists; `config update` changes the fields of an entry.

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

## Cloud projects

A management command acts on a project of Meilisearch Cloud, identified by its integer `id`, `meili update projects --id 343`. The id is not shown in the Cloud dashboard, so the config file can carry it, as `cloudId`, and `--project <name>` gives it to the command: `meili update projects --project prod --name renamed`.

- `--project` and `--id` together are a `cli_usage` error, exit 2: the name and the id contradict each other. Neither is `cli_usage` too.
- An entry without `cloudId` is a `cli_config` error, exit 2, whose hint names the ways to set it. The CLI never resolves the id by itself, from the URL or otherwise.
- `--project` on a management command none of whose routes takes a project, `create projects`, is a `cli_usage` error: a flag is never ignored in silence.

Three ways set `cloudId`, all explicit, the only moments the CLI consults the Management API on the config file's behalf:

1. `meili create projects … --add-to-config`: the created project joins the file, as an entry named after it, with its URL and `cloudId`. Its key is not written. A name the file already has is a `cli_config` error before the project is created.
2. `meili config add … --project-cloud-id <id>` and `meili config update --project <name> --project-cloud-id <id>`: the id, written by hand.
3. `meili config sync-with-cloud [--team-id <id>]`: lists the projects the token sees. An entry whose `cloudId` is one of them is unchanged; an entry without `cloudId` whose URL is one of theirs, same scheme and host, gets its `cloudId`; every other project becomes an entry named after it, with its URL and `cloudId`. A name the file uses for another URL is a `cli_config` error and nothing is written. The entries whose `cloudId` the token no longer sees are reported as `missing` and kept. No key is ever written: a key in the file is always the human's choice.

## Management API connection: resolution order

The credential is a personal access token (PAT), created in the Meilisearch Cloud dashboard and sent as `Authorization: Bearer <token>`.

1. Flag: `--management-token`
2. Environment variable: `MEILI_MANAGEMENT_TOKEN`

If no token is found, the CLI fails before any network call with `cli_auth_missing` and exit code 3. The hint says where to create a token.

The base URL comes from `--management-url`, then `MEILI_MANAGEMENT_URL`, and defaults to `https://api.meilisearch.com`. Every path starts with `/api/v2`.

Storing a token on disk, with a `login` command, is a decision of the Management API milestone. It is not in this contract.

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
| `MEILI_OUTPUT` | Default output mode: `json` or `ndjson`. |
| `MEILI_TIMEOUT` | Default `--timeout` for `--wait`. |

Every variable is documented in `meili --help`. Adding a variable is a contract change.

A variable that doubles a flag takes its name from the flag: `MEILI_` followed by the flag name in upper snake case. `--project-url` and `MEILI_PROJECT_URL`, `--timeout` and `MEILI_TIMEOUT`, `--management-token` and `MEILI_MANAGEMENT_TOKEN`. `MEILI_CONFIG` has no flag, the file is chosen per process, and `--project` has no variable, a project is chosen per command. The contract tests check the pairs.

## Secrets

- API keys and tokens never appear on stdout, on stderr, in `--debug` traces, in error messages or in snapshots. When a secret must be shown at all, only its last four characters are: `****1a2b`. `meili config list` masks keys the same way.
- `--debug` redacts the `Authorization` header and every field named `apiKey`, `apikey`, `masterKey`, `key`, `token` in request and response bodies. `masterKey` is a Cloud project's master key, as the Management API returns it. The redaction lives in `src/lib/config.ts` and is tested.
- The CLI reads keys from the config file, and from nowhere else on disk, and warns when the file is readable by others. Passing a key in a flag is allowed and documented as visible in the process list and in the shell history; `--project-api-key -` reads it from stdin instead.
