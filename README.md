# Meilisearch CLI

`meili` is the command line tool for [Meilisearch](https://www.meilisearch.com). It works with any instance, local or remote, and with Meilisearch Cloud through its Management API.

## Install

With npm, where Node 22 or newer is installed:

```sh
npm install -g @meilisearch/cli
```

With Homebrew:

```sh
brew install meilisearch/tap/meili
```

From the GitHub release assets, on macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/meilisearch/cli/main/scripts/install.sh | sh
```

- The script installs the CLI with its own Node in `~/.local/share/meili`.
- It links `meili` in `~/.local/bin`, or in the folder of `MEILI_CLI_INSTALL_DIR`.
- `MEILI_CLI_VERSION=0.1.0` installs this version instead of the latest one.
- Run the script again to update.

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

## From self-hosted to Meilisearch Cloud

Meilisearch Cloud upgrades and monitors your project for you, shows how it is searched, and is [free for 14 days](https://www.meilisearch.com/pricing).

`meili teleport` moves the data of a self-hosted Meilisearch, local or in production, to a new Meilisearch Cloud project. It asks its questions in the terminal:

```sh
meili teleport
```

It asks for the project to move, from the config file or by its URL and key. It checks that the key can export, logs you in to Meilisearch Cloud (and creates your account), creates the project on the free trial or on the plan you choose, adds it to the config file, and sends the data to it.

`meili teleport` is interactive. The same steps without questions:

```sh
meili auth login   # a human logs in once, in a browser
meili add projects --name cloud --team-id <id> --resource-id <id> --sync-config --wait
meili export --project local --project-destination cloud --wait
meili get tasks --project cloud --statuses enqueued,processing   # run it again until it lists no task
```

The team id and the resource id can be fetched with `meili get teams` and `meili get resources`.

## Documentation

```sh
meili --help             # every command, global flag and environment variable
meili get indexes --help # one command: flags, examples
meili schema             # the command tree as JSON, one entry per command with its routes
meili schema --command "get indexes" # one command in full, as JSON
```

## Analytics

`meili` sends anonymous usage data to Meilisearch: the commands you run, the names of their flags, their errors, and in `meili teleport` the options you choose. It never sends the values of the flags, your data or your keys. After `meili auth login`, the events are linked to your Meilisearch Cloud account. To turn it off, set `MEILI_NO_ANALYTICS=true`. `DO_NOT_TRACK=1` works too, and nothing is sent in CI. The details are in [`docs/contract/config.md`](docs/contract/config.md#analytics).

To contribute, read [`CONTRIBUTING.md`](CONTRIBUTING.md). [MIT](LICENSE).
