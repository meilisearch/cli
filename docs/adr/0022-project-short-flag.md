# ADR 0022: `-p` is the short form of `--project`

Status: accepted. Date: 2026-11-05.

## Context

ADR 0005 makes every Meilisearch command name its project on the command line. There is no default project and no `MEILI_PROJECT`. So `--project` is the flag that people type the most. Until now, no flag of `meili` had a short form, except `-h` from oclif.

Alternatives considered:

- **No short form.** Nothing changes. But a human keeps typing `--project` on every command.
- **A default project**, in the config file or in an environment variable. ADR 0005 refused it: the command would no longer say where it goes.
- **Short forms for every frequent flag**, such as `-i` for `--index` or `-f` for `--file`. Each one is a synonym that `--help`, `meili schema` and the docs must carry. And it opens the question again for every new flag.

## Decision

- **`-p` is the short form of `--project`**, on every command that declares `--project`. Everywhere, `--project` names an entry of the config file: for the connection, for the `cloud.id` of a management command, or for the entry that a `config` command or `teleport` reads or writes.
- **`-p` is an exception, not a rule.** No other flag gets a short form. A new one needs its own ADR.
- **In the examples of `--help`, the first example that names a project writes `--project`, the next ones write `-p`.** The reader learns the long name first, then sees the short form in use. The contract docs keep writing `--project`.
- **`--help` and `meili schema` show `-p`**: oclif prints `-p, --project=<name>`, and `meili schema` gives the `char` of the flag.
- **Analytics send `project`** for `-p` as for `--project`. No new event or property.

## Consequences

- The command target stays explicit on every command line. Nothing is deduced.
- An agent can read `-p` in examples. `meili schema` tells it what `-p` means.
