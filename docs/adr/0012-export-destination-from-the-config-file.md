# ADR 0012: The destination of `export` can be a project of the config file

Status: accepted. Date: 2026-11-03.

## Context

`meili export` calls `POST /export` on one instance, which sends its documents and settings to another one. The command reaches two projects. The source is the project the command connects to, through the connection group of ADR 0010: `--project`, `--project-url`, `--project-api-key`. The destination is sent in the body, as the `url` and `apiKey` fields, so the naming rules give it `--url` and `--api-key`.

Two things went wrong with that. First, nothing in `--help` said which of the two projects `--project` names. On a command that speaks of two instances, "the project" is ambiguous. Second, a user with both projects in the config file had to copy the destination's URL and key on the command line. There, the key ends up in the shell history and in the transcript of an agent. ADR 0005 created the config file to avoid exactly that.

Alternatives considered:

- **Rename `--url` and `--api-key` to `--destination-url` and `--destination-api-key`.** Clearer, but against rule 6: a body field keeps its API name. A clearer name alone is not worth an exception. The help can carry the meaning instead.
- **A second connection group, `--source-*` and `--destination-*`.** It would make `export` the only Meilisearch command whose connection flags differ from those of every other command. It would also break the contract test of ADR 0010.
- **Resolve the destination from the ambient sources**, the environment or a single-project file, like the source. That deduces a target, which ADR 0005 refuses. And here the target is the instance whose data the export overwrites.

## Decision

- **The connection group names the source**, unchanged. The description of `export` and the description of `--api-key` say so explicitly.
- **`--project-destination <name>`** names an entry of the config file as the destination: its `url` and `apiKey` fill the body fields `url` and `apiKey`. It is a CLI-owned flag, on `export` only, listed with the others in rule 6 of `commands.md`. Its name starts with `--project` because it names a project of the file, like `--project`.
- **It mirrors `--project`.** With `--url`, it is `cli_usage`, like `--project` with `--project-url`: the name and the URL contradict each other. A name that the file does not have is `cli_config`, with the names the file has. `--api-key` replaces the key of the entry, as `--project-api-key` does. The key of an entry is only ever sent with the URL of that entry.
- **The destination is never deduced.** Without `--url`, `--project-destination` or a `url` in `--data` or `--file`, the body has no `url` and the API refuses it.
- **`--help` groups the destination flags** under `DESTINATION FLAGS`: `--url`, `--api-key`, `--project-destination` and `--payload-size`, the size of a request to the destination. oclif's `helpGroup` does it. It changes no name and no behavior.

## Consequences

- An agent exports between two projects of its file with no key on the command line: `meili export --project staging --project-destination prod`.
- The key of the destination entry is sent in the body of `POST /export`. `--debug` already redacts the `apiKey` field (`config.md`, "Secrets"), so the key never appears in a trace.
- No environment variable doubles `--project-destination`, as none doubles `--project`: a project is chosen per command.
- The flag shows in `meili schema --command export`, in the flags the command declares.
