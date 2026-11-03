# Meilisearch CLI

`meili` is the command line tool for [Meilisearch](https://www.meilisearch.com): any instance, local or remote, and Meilisearch Cloud through its Management API. Built for coding agents first: no prompt, JSON on stdout, errors as JSON on stderr, stable exit codes.

## Install

TBD. The package is not published yet. To run it from the source, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Get started

**1. Log in to Meilisearch Cloud**, once, in a browser:

```sh
meili auth login
```

The session is kept next to the config file, and the management commands refresh it on their own. `meili auth status` says whether it is still accepted, `meili auth logout` ends it.

**2. Add your projects to the config file**, `~/.config/meili/config.json`:

```sh
meili config sync-with-cloud --all   # every Cloud project you can see, with its URL and, when you own its team, its master key
meili config set --project local --project-url http://localhost:7700 --project-api-key - < key.txt   # an instance that is not on Meilisearch Cloud
meili config list                    # the projects of the file, keys masked
```

`--team-ids`, `--project-name` and `--project-url` narrow `sync-with-cloud` down. A key already in the file is never replaced; `meili config update --project <name> --project-api-key -` gives a project the key you got elsewhere.

**3. Run commands**, naming the project with `--project`:

```sh
meili get indexes --project prod
meili search --project prod --index movies --q "star wars"
meili add documents --project local --index movies --file movies.json --wait
meili update projects --project prod --name renamed   # a management command, on the Cloud project of the entry
meili add projects --name demo --team-id 12 --resource-id 3 --sync-config   # creates a Cloud project and adds it to the file
```

`--project` is required on every command, even when the file has a single project: the CLI never guesses, and no environment variable stands for it. Without a config file, name the instance outright: `--project-url <url> --project-api-key <key>`.

## The config file

```json
{
  "projects": {
    "local": { "url": "http://localhost:7700", "apiKey": "..." },
    "prod": { "url": "https://ms-abc.sfo.meilisearch.io", "apiKey": "...", "cloud": { "id": 343, "teamId": 12, "teamName": "Search" } }
  }
}
```

`cloud` holds the project's identifiers in Meilisearch Cloud, which the dashboard does not show: `sync-with-cloud`, `--sync-with-cloud` on `config set` and `config update`, and `--sync-config` on `add projects`, `update projects` and `delete projects` write it. `meili config list`, `config set`, `config update`, `config unset` and `config sync-with-cloud` manage the file. It holds your keys: keep it readable by you alone, the CLI warns on stderr otherwise. `MEILI_CONFIG` names another file.

## For a coding agent

Give the agent its own config file through `MEILI_CONFIG`, read-only: the file is shared state, and an agent must not be able to change where another one's commands go. It changes nothing in it, neither a project nor its permissions, unless you asked for it explicitly. The agent uses the session you logged in with and never runs `auth login` itself; the session sits next to the config file, so log in with the agent's variable set:

```sh
MEILI_CONFIG=~/agents/search/config.json meili auth login
MEILI_CONFIG=~/agents/search/config.json meili config sync-with-cloud --project-name prod
```

## Documentation

```sh
meili --help             # every command, global flag and environment variable
meili get indexes --help # one command: flags, examples
```

To contribute, read [`CONTRIBUTING.md`](CONTRIBUTING.md). [MIT](LICENSE).
