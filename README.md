# Meilisearch CLI

`meili` is the command line tool for [Meilisearch](https://www.meilisearch.com): any instance, local or remote, and Meilisearch Cloud through its Management API. Built for coding agents first: no prompt, JSON on stdout, errors as JSON on stderr, stable exit codes.

## Install

TBD. The package is not published yet. To run it from the source, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Get started

**1. Log in to Meilisearch Cloud**, once, in a browser:

```sh
meili auth login
```

**2. Add your projects to the config file**:

```sh
meili config sync-with-cloud --all   # every Cloud project you can see, with its URL and, when you own its team, its master key
meili config set --project local --project-url http://localhost:7700 --project-api-key <your-key>   # an instance that is not on Meilisearch Cloud
meili config list                    # the projects of the file, keys masked
```

The config file is `~/.config/meili/config.json` by default, `$XDG_CONFIG_HOME/meili/config.json` when `XDG_CONFIG_HOME` is set. `MEILI_CONFIG` names another file.

`--team-ids`, `--project-name` and `--project-url` narrow `sync-with-cloud` down. A key already in the file is never replaced; `meili config update --project <name> --project-api-key -` gives a project the key you got elsewhere.

**3. Run commands**, naming the project with `--project`:

```sh
meili get indexes --project prod
meili search --project prod --index movies --q "star wars"
meili add documents --project local --index movies --file movies.json --wait
meili update projects --project prod --name renamed   # a management command, on the Cloud project of the entry
meili add projects --name demo --team-id 12 --resource-id 3 --sync-config   # creates a Cloud project and adds it to the file
```

`--project` is required on every command. Without a config file, name the instance outright: `--project-url <url> --project-api-key <key>`.

## Documentation

```sh
meili --help             # every command, global flag and environment variable
meili get indexes --help # one command: flags, examples
```

To contribute, read [`CONTRIBUTING.md`](CONTRIBUTING.md). [MIT](LICENSE).
