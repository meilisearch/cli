# ADR 0012: The destination of `export` can be a project of the config file

Status: accepted. Date: 2026-11-03.

## Context

`meili export` calls `POST /export` on one instance, which sends its documents and settings to another one. The command reaches two projects. The source is the project the command connects to, through the connection group of ADR 0010: `--project`, `--project-url`, `--project-api-key`. The destination travels in the body, as the `url` and `apiKey` fields, so the naming rules give it `--url` and `--api-key`.

Two things went wrong with that. Read in `--help`, nothing said which of the two projects `--project` names: on a command that speaks of two instances, "the project" is ambiguous. And a user whose two projects are both in the config file had to copy the destination's URL and key on the command line, where the key lands in the shell history and in the transcript of an agent. ADR 0005 made the config file to avoid exactly that.

Alternatives considered:

- **Rename `--url` and `--api-key` to `--destination-url` and `--destination-api-key`.** Clearer, but against rule 6: a body field keeps its API name. An exception for a name that is only clearer is not worth it, and the help can carry the meaning instead.
- **A second connection group, `--source-*` and `--destination-*`.** It would make `export` the one Meilisearch command whose connection flags are not the ones of every other command, and break the contract test of ADR 0010.
- **Resolve the destination from the ambient sources**, the environment or a single-project file, like the source. That deduces a target, which ADR 0005 refuses, and here the target is the instance whose data the export overwrites.

## Decision

- **The connection group names the source**, unchanged. `export`'s description and the description of `--api-key` say so in words.
- **`--project-destination <name>`** names an entry of the config file as the destination: its `url` and `apiKey` fill the body fields `url` and `apiKey`. It is a CLI-owned flag, on `export` only, listed with the others in rule 6 of `commands.md`. Its name starts with `--project` because it names a project of the file, like `--project`.
- **It mirrors `--project`.** With `--url` it is `cli_usage`, as `--project` with `--project-url`: the name and the URL contradict each other. A name the file does not have is `cli_config` with the names it has. `--api-key` replaces the key of the entry, as `--project-api-key` does. The key of an entry is only ever sent with the URL of that entry.
- **The destination is never deduced.** Without `--url`, `--project-destination` or a `url` in `--data` or `--file`, the body has no `url` and the API refuses it.
- **`--help` groups the destination flags** under `DESTINATION FLAGS`: `--url`, `--api-key`, `--project-destination` and `--payload-size`, the size of a request to the destination. oclif's `helpGroup` does it; it changes no name and no behavior.

## Consequences

- An agent exports between two projects of its file with no key on the command line: `meili export --project staging --project-destination prod`.
- The key of the destination entry travels in the body of `POST /export`. `--debug` already redacts the `apiKey` field (`config.md`, "Secrets"), so it never appears in a trace.
- No environment variable doubles `--project-destination`, as none doubles `--project`: a project is chosen per command.
- The flag shows in `meili schema --command export`, in the flags the command declares.
