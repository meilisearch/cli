# Meilisearch CLI

`meili` is the command line tool for [Meilisearch](https://www.meilisearch.com): any instance, local or remote, and Meilisearch Cloud through its Management API. Built for coding agents first: no prompt, JSON on stdout, errors as JSON on stderr, stable exit codes.

## Install

TBD. The package is not published yet. To run it from the source, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Configure

**Meilisearch API**, for the commands that talk to a project, that is a Meilisearch instance, yours or on Meilisearch Cloud:

```sh
export MEILI_PROJECT_URL=http://localhost:7700
export MEILI_PROJECT_API_KEY=masterKey   # only if the instance has a master key

meili get health
```

**Management API**, for the commands that manage Meilisearch Cloud, `meili create projects`, `meili update projects` and `meili delete projects`:

```sh
export MEILI_MANAGEMENT_TOKEN=...       # a personal access token from the Meilisearch Cloud dashboard

meili create projects --name demo --team-id 12 --resource-id 3
```

The URL, the key and the token also exist as flags with the same name: `--project-url`, `--project-api-key`, and `--management-token` with the management commands. The flag wins over the variable.

**Several projects**: put them in `~/.config/meili/config.json`, readable by you alone, and name the one a command targets with `--project`:

```json
{
  "projects": {
    "local": { "url": "http://localhost:7700" },
    "prod": { "url": "https://ms-abc.sfo.meilisearch.io", "apiKey": "...", "cloudId": 343 }
  }
}
```

```sh
meili get indexes --project prod
meili update projects --project prod --name renamed   # a management command uses the cloudId
```

With several projects in the file, `--project` is required: the CLI never guesses, and it refuses to run when the file and the `MEILI_PROJECT_URL` variable both define a project. `MEILI_CONFIG` names another file. For a coding agent, give it its own file through `MEILI_CONFIG`, read-only: the file is shared state, and an agent must not be able to change where another one's commands go. The file holds your keys: keep it readable by you alone, the CLI warns on stderr otherwise, and an agent changes nothing in it, neither a project nor its permissions, unless you asked for it explicitly. `meili config list`, `meili config add`, `meili config update` and `meili config remove` manage the file.

`cloudId` is the project's id in Meilisearch Cloud, which the dashboard does not show. `meili config sync-with-cloud` fills it on the entries whose URL is a project your token sees; `meili create projects --add-to-config` adds the project it creates, with its URL and `cloudId`. Neither writes a key.

## Documentation

```sh
meili --help             # every command, global flag and environment variable
meili get indexes --help # one command: flags, examples
```

To contribute, read [`CONTRIBUTING.md`](CONTRIBUTING.md). [MIT](LICENSE).
