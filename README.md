# Meilisearch CLI

`meili` is the official command line tool for [Meilisearch](https://www.meilisearch.com). It talks to any Meilisearch instance, local or remote, and to Meilisearch Cloud.

It is built for coding agents first: no prompts, structured output, stable errors and exit codes, and a `meili schema` command that describes the whole CLI in one call.

> **Status:** work in progress. The command tree and contracts are defined in `docs/`, the implementation has not started yet. Nothing is published on npm for now.

## Install

Once released, the package will be `@meilisearch/cli` on npm and the binary `meili`.

```sh
npm install -g @meilisearch/cli
```

Requires Node 22 or newer.

## Quick start

```sh
export MEILI_URL=http://localhost:7700
export MEILI_API_KEY=masterKey

meili health
meili index create movies --primary-key id --wait
meili document add movies --file movies.json --wait
meili search movies "batman" --limit 5
meili settings update movies filterable-attributes --data '["genres"]' --wait
```

Every command prints JSON when stdout is not a terminal, and a table when it is. Force a mode with `--output json|ndjson|table`.

## Command tree

```
meili health | version | stats
meili index      list | get | create | update | delete | swap | stats
meili document   list | get | add | update | delete | delete-all
meili search <index> [query]
meili multi-search | facet-search | similar
meili settings   get | update | reset
meili task       list | get | wait | cancel | delete
meili batch      list | get
meili key        list | get | create | update | delete
meili dump create | meili snapshot create
meili context    list | add | use | current | remove
meili cloud      login | logout | whoami | org | project | billing | region | plan
meili schema | docs | completions <shell>
```

The full list, with the API route behind each command, lives in [`docs/contract/commands.md`](docs/contract/commands.md).

## Configuration

Connection settings resolve in this order: flags (`--url`, `--api-key`), environment variables (`MEILI_URL`, `MEILI_API_KEY`), then a named context from the config file.

Contexts let you switch between instances:

```sh
meili context add prod --url https://ms-abc123.fra.meilisearch.io --api-key ...
meili context use prod
meili context current
```

See [`docs/contract/config.md`](docs/contract/config.md) for every environment variable and the config file format.

## Designed for agents

- Data goes to stdout, everything else goes to stderr.
- API responses are returned as they are, never wrapped.
- Errors are JSON objects with a stable `code`, and exit codes have fixed meanings (see [`docs/contract/output.md`](docs/contract/output.md)).
- No interactive prompt when stdin is not a TTY. Destructive commands need `--yes`.
- `meili schema` prints every command, argument and flag as JSON. `meili docs` prints a compact agent guide.

## Documentation

- [`docs/contract/`](docs/contract/): what the CLI promises (commands, output, config)
- [`docs/adr/`](docs/adr/): why we decided what we decided
- [`CLAUDE.md`](CLAUDE.md): maintainer guide for humans and coding agents

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md), then `CLAUDE.md`. One command per pull request, and `pnpm lint`, `pnpm typecheck`, `pnpm test` must pass.

## License

[MIT](LICENSE)
