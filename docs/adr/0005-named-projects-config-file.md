# ADR 0005: Named projects in a config file, chosen on the command line, nothing deduced

Status: accepted. Date: 2026-10-14. One point is superseded by ADR 0006: an entry is changed with `config update`, no longer with `config unset` then `config set`.

## Context

`meili` talks to one project at a time, given by `--project-url` and `--project-api-key`. To work with several instances (a local one, a staging one, a Cloud project), the user repeats the URL and the key on every command line. The key then ends up in the shell history and in the transcript of an agent. We want a human to set up several projects once and share that setup easily. We want an agent to work on two projects in the same session, with each command naming its target. ADR 0004 left a config file undecided, for its own ADR. This is that ADR.

kubectl solves this with contexts in a file, and a current context that `kubectl config use-context` switches. Every process that reads the file shares that current context. Two agents on one machine, or a `use-context prod` forgotten in another terminal, send the next command to the wrong cluster. Incidents caused by the wrong context are documented for humans. The people who build tools for agents on Kubernetes describe it as the first failure mode to guard against.

Alternatives considered:

- **Suffixed variables**, `MEILI_PROJECT_URL_PROD` and `MEILI_PROJECT_API_KEY_PROD`, chosen with `--project prod`. There is no file and the choice is per process. But it is hard for a human to set up and to share.
- **A file per directory**, like `.nvmrc` or `wrangler.toml`. Users of `meili` do not always work in a directory tied to a project. Keys, tasks and Cloud projects have no repository behind them. And a key written in a repository ends up committed.
- **Resolving a Cloud project through the Management API**: `--project <uid>` would fetch the URL and the key with the management token. Meilisearch Cloud may stop exposing project keys through its API. It costs a call before every command. And it covers neither local nor self-hosted instances.
- **A current project in the file**, as kubectl. Rejected for the reason above: it is shared, mutable state that silently chooses the target of another person's command.

## Decision

- **A config file** holds named projects. Its path is `$MEILI_CONFIG` if set, else `$XDG_CONFIG_HOME/meili/config.json`, else `~/.config/meili/config.json`:

  ```json
  {
    "projects": {
      "local": { "url": "http://localhost:7700" },
      "prod": { "url": "https://ms-abc.sfo.meilisearch.io", "apiKey": "…" }
    }
  }
  ```

  The file has no current project and no default entry. It holds keys, so it belongs to one user, with mode `600`. When others can read the file, the CLI prints a warning on stderr and continues; it does not refuse. A file with loose permissions still works, and the human and the agent see the warning.

- **A project is chosen on the command line, or not at all.** `--project <name>` selects an entry of the file. `--project-url` and `--project-api-key` give a project directly. No environment variable replaces any of them: there is no `MEILI_PROJECT`, no `MEILI_PROJECT_URL` and no `MEILI_PROJECT_API_KEY`. A selection in a process environment is set once and forgotten, and then it chooses the target of every later command. It is one more thing to deduce. Rule 14 does not require a variable for every flag. A human writes the projects in the file. An agent names one with `--project`, from the file it was given. Or the agent receives a URL and a key, and passes them as flags.

- **Nothing is deduced.** A command without `--project` or `--project-url` is a `cli_usage` error. The file is read only for the entry that `--project` names. A file with a single project is not a default. If it were, adding a second project later would turn every command that relied on the default into an error. And until then, the command would not say where it goes. `--project` together with `--project-url` is a `cli_usage` error: the name and the URL contradict each other.

- **A URL and its key travel together.** With `--project-url`, the key comes from `--project-api-key` or from nowhere, never from the file. A configured key is never sent to a URL it was not configured with. `--project-api-key` with `--project` replaces the key of the configured project. An explicit key for a configured URL is the way to give an agent a restricted key.

- **Three commands without an API manage the file**, for humans. `config list` prints the path and the projects, with keys masked. `config set` creates the file in mode `600` and validates the URL. It reads the key from stdin with `--project-api-key -`, to keep the key out of the shell history. It refuses a name that already exists. `config unset` deletes an entry. These commands are a convenience, not a protection.

- **The file is shared state.** An agent gets its own file through `MEILI_CONFIG`, never the human's file. A human prepares that file and mounts it read-only in the agent's sandbox. An agent changes nothing in the file, neither a project nor its permissions, unless the human explicitly asked for it. `--help`, `meili schema` and the README say so, because an agent reads them.

- The container setup needs no file: `--project-url` and `--project-api-key` work with no file and no `HOME`.

## Consequences

- An agent works on two projects in one session, `--project staging` then `--project prod`. There is no key on any command line, and no state that another process can change without the agent knowing.
- Nothing implicit can choose the target silently: no variable, no default entry, no single entry. The cost: every command carries its target, `--project local` even when the file has nothing else. And a script must export the URL and the key under its own names, and pass them as flags.
- The CLI cannot protect against another writer of the same file. Someone can unset `staging` and set it again with other credentials. Then every later `--project staging` of anyone who shares the file goes to the new target. A process with a file tool does not even need `config set` to do this. Isolation, one file per agent, is the protection. `config set` refuses an existing name, but this only prevents a replacement by mistake.
- `config.md` changes one promise. The new promise: the CLI reads keys from the config file and from nowhere else on disk, and warns when others can read the file. `output.md` gains the warning format.
- Unit and integration tests point `MEILI_CONFIG` at a file that does not exist, so the own file of a developer never leaks into a test.
- `config.md` gains the file format and the resolution rules. `commands.md` gains the `--project` global flag and the three `config` commands.
