# ADR 0010: One global flag, and a connection group on the commands that reach a project

Status: accepted. Date: 2026-10-21.

## Context

`--project-url`, `--project-api-key` and `--project` were global. oclif put them on every command through `BaseCommand.baseFlags`. `commands.md` listed them in a table that said "these flags work on every command". That was true of the commands of that time, which all talked to a Meilisearch project.

It stopped being true with the `auth` commands of ADR 0009. They talk to the authorization server of Meilisearch Cloud and resolve no project at all. `meili auth login --help` showed three flags that the command ignores completely. So did `schema`, `config list` and `config unset`. An agent learns this CLI by reading `meili schema`. It was told that four commands take a project, but these commands do nothing with it. A flag that does nothing is worse than a missing one: nothing fails, and the agent simply believes something false.

ADR 0005 decided how a project is chosen. ADR 0008 decided how `meili schema` prints a command. Neither decided that the three flags belong to every command. 0005 calls `--project` a "global flag" once, in a consequence that records where the documentation went. 0008 counts "five global flags" in a context that describes the CLI as it was. Those two sentences are the only trace of the old setup. They are history, not decisions.

Alternatives considered:

- **Leave them global and hide them per command.** oclif can hide a flag from `--help`, but a hidden flag is still parsed. So `meili auth login --project prod` would still be accepted, and would still do nothing. The lie moves instead of going away.
- **Keep them in `baseFlags` and override that property on the commands that resolve no project.** This puts the right flags on the right commands, but with the wrong default. A new command gets the connection flags unless its author remembers to remove them. That is how the problem appeared in the first place.
- **One `--connection` flag carrying a URL and a key.** Fewer flags, but it breaks the resolution of ADR 0005, which handles the URL and the key separately.

## Decision

- **One flag is global**, on every command, whatever it talks to: `--debug`, because every command can be traced. `commands.md` keeps it in the "Global flags" table.

- **The three connection flags become a shared group**, `BaseCommand.connectionFlags`, next to the groups of the write commands and of the body input. A command spreads it when it talks to a Meilisearch project. No other command does: a command that resolves no project offers no way to name one.

- **The group sits in a command's own `flags`, not in `baseFlags`.** ADR 0008 prints the detail of a command from the flags its class declares. So connection flags in `baseFlags` would be invisible to `meili schema --command "get indexes"`. That is where an agent looks to learn how to reach a project. The index still prints the global flags once, and there is now one of them.

- **`meili config set` declares its own three.** It writes a project into the config file instead of connecting to one. `--project` is the name to set, `--project-url` the URL to store, and `--project-api-key` the key, where `-` reads the key from stdin to keep it out of the shell history. This also makes the rule testable without a list of exceptions. The connection group is on the commands whose `static api` is `meilisearch`, and on `config set`, which declares the three flags in its own flags.

- **A contract test holds it**: a command declares the connection flags if and only if it reaches a project. The test checks `--project-url`, because `config unset --project` names an entry of the file, not a connection, and may keep that name.

## Consequences

- `meili auth`, `meili schema`, `config list` and `config unset` no longer show three flags they ignore. `meili get indexes --help` is unchanged: oclif renders a leaf command's base flags and own flags in the same list.
- `meili schema` prints one global flag instead of five. The connection flags appear in the detail of the commands that take them, which is where they are usable.
- Nothing changes in how a project is resolved. ADR 0005 still fully applies, and `config.md` does not change.
- Two sentences of accepted ADRs now describe a time when the three flags were global: the consequence line of ADR 0005, and the context and one example of ADR 0008. They are not edited. Neither ADR is superseded, since this one changes none of their decisions. It decides which commands carry the flags, which neither of them had decided.
- A new command that talks to a project must spread the group. If it forgets, the failure is visible: the command cannot reach any project, and the contract test names it.
