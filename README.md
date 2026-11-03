# Meilisearch CLI

`meili` is the command line tool for [Meilisearch](https://www.meilisearch.com): any instance, local or remote, and Meilisearch Cloud through its Management API. Built for coding agents first: no prompt, JSON on stdout, errors as JSON on stderr, stable exit codes.

## Install

TBD. The package is not published yet. To run it from the source, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Configure

**Meilisearch API**, for the commands that talk to a project, that is a Meilisearch instance, yours or on Meilisearch Cloud:

```sh
meili get health --project-url http://localhost:7700 --project-api-key masterKey   # the key only if the instance has one
```

**Management API**, for the commands that manage Meilisearch Cloud, `meili get projects`, `meili add projects`, `meili update projects` and `meili delete projects`:

```sh
meili auth login     # once, in a browser; the session is kept next to the config file

meili add projects --name demo --team-id 12 --resource-id 3
```

The management commands refresh the session on their own. `meili auth status` says whether it is still accepted, `meili auth logout` ends it. A coding agent uses the session you logged in with; it never runs `auth login` itself.

A project has no variable: every command names it, with `--project-url` and `--project-api-key` or with `--project`.

**Named projects**: put them in `~/.config/meili/config.json`, readable by you alone, and name the one a command targets with `--project`:

```json
{
  "projects": {
    "local": { "url": "http://localhost:7700" },
    "prod": { "url": "https://ms-abc.sfo.meilisearch.io", "apiKey": "...", "cloud": { "id": 343, "teamId": 12, "teamName": "Search" } }
  }
}
```

```sh
meili get indexes --project prod
meili update projects --project prod --name renamed   # a management command uses cloud.id
```

`--project` is required, even when the file has a single project: the CLI never guesses. `MEILI_CONFIG` names another file. For a coding agent, give it its own file through `MEILI_CONFIG`, read-only: the file is shared state, and an agent must not be able to change where another one's commands go. The file holds your keys: keep it readable by you alone, the CLI warns on stderr otherwise, and an agent changes nothing in it, neither a project nor its permissions, unless you asked for it explicitly. `meili config list`, `meili config set`, `meili config update`, `meili config unset` and `meili config sync-with-cloud` manage the file.

`cloud` holds the project's identifiers in Meilisearch Cloud, which the dashboard does not show. `meili config sync-with-cloud --all` gives every project your token sees an entry, with its URL, its `cloud` and, when you own its team or organization, its master key; `--team-ids`, `--project-name` and `--project-url` narrow it down. A key already in the file is never replaced. `--sync-with-cloud` on `config set` and `config update` does the same for one entry, and `--sync-config` on `add projects`, `update projects` and `delete projects` makes the file follow the command.

## Documentation

```sh
meili --help             # every command, global flag and environment variable
meili get indexes --help # one command: flags, examples
```

To contribute, read [`CONTRIBUTING.md`](CONTRIBUTING.md). [MIT](LICENSE).
