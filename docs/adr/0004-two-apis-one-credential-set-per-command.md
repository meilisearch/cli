# ADR 0004: Two APIs, one credential set per command

Status: accepted. Date: 2026-09-29.

## Context

`meili` talks to two APIs with different credentials:

- the Meilisearch API, on a URL that changes per instance, with an API key sent as a Bearer token
- the Management API, on one fixed URL, with a personal access token sent as a Bearer token

A command needs exactly one of the two. If the CLI resolved both on every call, an agent that only wants `meili get indexes` would fail for a missing management token it does not need, and error messages would talk about credentials the command never uses. If each command resolved its own credentials, the resolution order would drift from one command to the next.

## Decision

- Every command declares the API it uses: `static api = "meilisearch" | "management" | "none"`.
- `BaseCommand` owns credential resolution and client construction. It resolves only the declared API, builds only that client, and produces errors that name only that API's sources.
- The resolution order is the same for both APIs and has two levels: the flag, then the environment variable. A flag and its variable share their name, `MEILI_` plus the flag name in upper snake case (CLAUDE.md, rule 14). The sources are documented in `docs/contract/config.md`.
- Connections come from flags and environment variables. A config file is not decided; if one comes, it comes with its own ADR.
- Management commands carry no prefix. The resource says which API a command talks to, `get projects`, `add teams`, and `static api` says which credentials it needs. No resource name collides between the two documents today; a collision would be an exception in `commands.md`.

## Consequences

- A command file contains no credential logic. Reviewers check one line, `static api`.
- Error messages are precise: an Meilisearch API command without URL exits 2 and names the flag and the variable; a management command without token exits 3 and says where to create a token. Neither mentions the other API.
- The configuration contract fits on one screen, and `meili --help` documents all of it.
- Adding a third API later means adding a value to `api` and one resolver in `BaseCommand`, not touching commands.
- The CLI prints each API's response as it is. When the two APIs spell a field differently, `apikey` on a Cloud project and `apiKey` in Meilisearch settings, the output keeps each spelling: an agent that reads an API's reference finds the same names in the CLI output.
