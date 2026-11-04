# Meilisearch CLI

`meili` is the command line tool for [Meilisearch](https://www.meilisearch.com). It works with any instance, local or remote, and with Meilisearch Cloud through its Management API.

## Install

TBD. The package is not published yet. To run it from source, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

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

The config file is `~/.config/meili/config.json` by default. `MEILI_CONFIG` sets another file.

`--team-ids`, `--project-name` and `--project-url` limit the projects that `sync-with-cloud` adds. A key already in the file is never replaced. To give a project a key you got elsewhere, run `meili config update --project <name> --project-api-key -`.

**3. Run commands**, naming the project with `--project`:

```sh
meili get indexes --project prod
meili search --project prod --index movies --q "star wars"
meili add documents --project local --index movies --file movies.json --wait
meili update projects --project prod --name renamed   # a management command, on the Cloud project of the entry
meili add projects --name demo --team-id 12 --resource-id 3 --sync-config   # creates a Cloud project and adds it to the file
```

`--project` is required on every command. Without a config file, give the instance directly: `--project-url <url> --project-api-key <key>`.

## Move your data to Meilisearch Cloud

`meili teleport` moves the data of a Meilisearch instance, local or in production, to a new Meilisearch Cloud project. It asks its questions in the terminal:

```sh
meili teleport
```

It asks for the project to move, from the config file or by its URL and key. It checks that the key can export, logs you in to Meilisearch Cloud (and creates your account), creates the project on the free trial or on the plan you choose, adds it to the config file, and sends the data to it.

`meili teleport` is interactive, for humans only. Coding agents must not run it: without a terminal, it fails. The same steps without questions:

```sh
meili auth login   # a human logs in once, in a browser
meili add projects --name cloud --team-id <id> --resource-id <id> --sync-config --wait
meili export --project local --project-destination cloud --wait
meili get tasks --project cloud --statuses enqueued,processing   # run it again until it lists no task
```

The team id and the resource id are in the Meilisearch Cloud dashboard.

## Documentation

```sh
meili --help             # every command, global flag and environment variable
meili get indexes --help # one command: flags, examples
meili schema             # the command tree as JSON, one entry per command with its routes
meili schema --command "get indexes" # one command in full, as JSON
```

To contribute, read [`CONTRIBUTING.md`](CONTRIBUTING.md). [MIT](LICENSE).
