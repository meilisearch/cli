# ADR 0005: Named projects in a config file, chosen on the command line, nothing deduced

Status: accepted. Date: 2026-10-14. One point is superseded by ADR 0006: an entry is changed with `config update`, no longer with `remove` then `add`.

## Context

`meili` talks to one project at a time, given by `--project-url` and `--project-api-key` or by `MEILI_PROJECT_URL` and `MEILI_PROJECT_API_KEY`. Working with several instances, a local one, a staging one, a Cloud project, means re-exporting variables between commands or repeating the URL and the key on every command line, where the key lands in the shell history and in the transcript of an agent. We want a human to set up several projects once and share that setup easily, and an agent to work on two projects in the same session, each command naming its target. ADR 0004 left a config file undecided, to come with its own ADR: this is it.

kubectl solves this with contexts in a file and a current context that `kubectl config use-context` switches. That current context is shared by every process that reads the file: two agents on one machine, or a `use-context prod` forgotten in another terminal, send the next command to the wrong cluster. Wrong-context incidents are documented for humans, and the people who tool agents on Kubernetes describe it as the first failure mode to guard against.

Alternatives considered:

- **Suffixed variables**, `MEILI_PROJECT_URL_PROD` and `MEILI_PROJECT_API_KEY_PROD`, chosen with `--project prod`. No file and per process, but impractical for a human to set up and to share.
- **A file per directory**, like `.nvmrc` or `wrangler.toml`. Users of `meili` are not necessarily in a directory tied to a project: keys, tasks and Cloud projects have no repository behind them, and a key written in a repository ends up committed.
- **Resolving a Cloud project through the Management API**, `--project <uid>` fetching the URL and the key with the management token. Meilisearch Cloud may not keep exposing project keys through its API, it costs a call before every command, and it covers neither local nor self-hosted instances.
- **A current project in the file**, as kubectl. Rejected for the reason above: shared mutable state that silently chooses the target of someone else's command.

## Decision

- **A config file** holds named projects: `$MEILI_CONFIG` if set, else `$XDG_CONFIG_HOME/meili/config.json`, else `~/.config/meili/config.json`:

  ```json
  {
    "projects": {
      "local": { "url": "http://localhost:7700" },
      "prod": { "url": "https://ms-abc.sfo.meilisearch.io", "apiKey": "…" }
    }
  }
  ```

  The file has no current project and no default entry. It holds keys, so it belongs to one user, mode `600`; when it is readable by others the CLI warns on stderr and goes on rather than refusing: a file with loose permissions still works, and the warning is what the human and the agent see.

- **A project is chosen on the command line, or not at all.** `--project <name>` selects an entry of the file. There is no `MEILI_PROJECT` variable: a selection that lives in a process environment is one more thing to deduce, and rule 14 does not require a variable for every flag.

- **Nothing is deduced.** The command line wins. Otherwise exactly one ambient source must define exactly one project: the environment pair alone, or the file alone with a single project. A file with several projects and no `--project`, or the environment pair and a file at the same time, is a `cli_config` error that lists what was found. `--project` together with `--project-url` is a `cli_usage` error: the name and the URL contradict each other.

- **A URL and its key travel together.** With `--project-url`, the key comes from `--project-api-key` or from nowhere, never from the environment or the file: a configured key is never sent to a URL it was not configured with. `--project-api-key` alone, or with `--project`, replaces the key of the configured project: an explicit key for a configured URL is the way to hand an agent a restricted key.

- **Three commands without an API manage the file**, for humans: `config list` prints the path and the projects with keys masked; `config add` creates the file in mode `600`, validates the URL, reads the key from stdin with `--project-api-key -` to keep it out of the shell history, and refuses a name that already exists; `config remove` deletes an entry. They are a convenience, not a protection.

- **The file is shared state.** An agent gets its own file through `MEILI_CONFIG`, prepared by a human and mounted read-only in its sandbox, never the human's file. An agent changes nothing in the file, neither a project nor its permissions, unless the human asked for it explicitly. `--help`, `meili schema` and the README say so, because those are what an agent reads.

- The single-project setup does not change: the environment pair alone, as in a container, keeps working with no file.

## Consequences

- An agent works on two projects in one session, `--project staging` then `--project prod`, with no key on any command line and no state that another process can switch under it.
- A forgotten variable cannot choose the target silently: the environment pair next to a file is an error, not a precedence. The price is that a script which exports the pair on a machine that has a file must point `MEILI_CONFIG` at a file that does not exist, or unset the pair.
- What the CLI cannot protect against: another writer of the same file. Removing `staging` and adding it back with other credentials redirects every later `--project staging` of whoever shares the file, and a process with a file tool does not need `config add` to do it. Isolation, one file per agent, is the protection; `config add` refusing an existing name only prevents a replacement by mistake.
- `config.md` changes one promise: the CLI reads keys from the config file, and from nowhere else on disk, and warns when the file is readable by others. `output.md` gains the warning format.
- Unit and integration tests point `MEILI_CONFIG` at a file that does not exist, so a developer's own file never leaks into a test.
- `config.md` gains the file format and the resolution rules, `commands.md` the `--project` global flag and the three `config` commands.
