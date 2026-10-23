# ADR 0010: Two global flags, and a connection group on the commands that reach a project

Status: accepted. Date: 2026-10-21.

## Context

`--project-url`, `--project-api-key` and `--project` were global: oclif put them on every command through `BaseCommand.baseFlags`, and `commands.md` listed them in a table that said "these flags work on every command". That was true of the commands written at the time, which all talked to a Meilisearch project.

It stopped being true with the `auth` commands of ADR 0009, which talk to the authorization server of Meilisearch Cloud and resolve no project at all. `meili auth login --help` advertised three flags it ignores entirely, and so did `schema`, `config list` and `config unset`. An agent learns this CLI by reading `meili schema`, and it was being told that four commands take a project they do nothing with. A flag that does nothing is worse than a missing one: nothing fails, the agent just believes something false.

ADR 0005 decided how a project is chosen and ADR 0008 how `meili schema` prints a command. Neither decided that the three flags belong to every command: 0005 names `--project` a "global flag" once, in a consequence that records where the documentation went, and 0008 counts "five global flags" in a context that describes the CLI as it was. Those two sentences are the only trace of the old arrangement, and they are history, not decisions.

Alternatives considered:

- **Leave them global and hide them per command.** oclif can hide a flag from `--help`, but a hidden flag still parses, so `meili auth login --project prod` would still be accepted and still do nothing. The lie moves instead of going away.
- **Keep them in `baseFlags` and override that property on the commands that resolve no project.** The right flags on the right commands, but the wrong default: a new command gets the connection unless its author remembers to take it away, which is how the problem appeared in the first place.
- **One `--connection` flag carrying a URL and a key.** A smaller surface, but it breaks the resolution of ADR 0005 and the pairing of flags and environment variables of rule 14.

## Decision

- **Two flags are global**, on every command whatever it talks to: `--output`, because every command answers, and `--debug`, because every command may be traced. `commands.md` keeps them in the "Global flags" table.

- **The three connection flags become a shared group**, `BaseCommand.connectionFlags`, next to the groups of the write commands and of the body input. A command spreads it when it talks to a Meilisearch project, and no other command does: a command that resolves no project offers no way to name one.

- **The group sits in a command's own `flags`, not in `baseFlags`.** ADR 0008 prints the detail of a command from the flags its class declares, so a connection in `baseFlags` would be invisible to `meili schema --command "get indexes"`, which is where an agent looks to learn how to reach a project. The index keeps printing the global flags once, now two of them.

- **`meili config set` declares its own three.** It writes a project into the config file rather than connecting to one: `--project` is the name to set, `--project-url` the URL to store, `--project-api-key` the key, with `-` reading stdin out of the shell history. That also makes the rule testable without a list of exceptions: the connection group is on the commands whose `static api` is `meilisearch`, and on `config set`, which says so in its own flags.

- **A contract test holds it**: a command declares the connection flags if and only if it reaches a project. It keys on `--project-url`, because `config unset --project` names an entry of the file, not a connection, and is allowed to keep that name.

## Consequences

- `meili auth`, `meili schema`, `config list` and `config unset` stop advertising three flags they ignore. `meili get indexes --help` is unchanged: oclif renders a leaf command's base flags and own flags in the same list.
- `meili schema` prints two global flags instead of five, and the connection appears in the detail of the commands that take it, which is where it is usable.
- Nothing changes in how a project is resolved: ADR 0005 holds entirely, and `config.md` is untouched.
- Two sentences of accepted ADRs now describe a world where the three flags were global: the consequence line of ADR 0005 and the context and one example of ADR 0008. They are not edited, and neither ADR is superseded, since this one changes no decision of theirs: it decides which commands carry the flags, which neither had decided.
- A new command that talks to a project has to spread the group. Forgetting it is loud: the command cannot be pointed at anything, and the contract test names it.
