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

**Management API**, for the commands that manage Meilisearch Cloud, `meili get projects` or `meili create teams` (not shipped yet):

```sh
export MEILI_MANAGEMENT_TOKEN=...       # a personal access token from the Meilisearch Cloud dashboard
```

Every setting also exists as a flag with the same name: `--project-url`, `--project-api-key`, and `--management-token` with the management commands. The flag wins over the variable.

## Documentation

```sh
meili --help             # every command, global flag and environment variable
meili get indexes --help # one command: flags, examples
```

To contribute, read [`CONTRIBUTING.md`](CONTRIBUTING.md). [MIT](LICENSE).
