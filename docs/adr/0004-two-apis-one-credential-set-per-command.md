# ADR 0004: Two APIs, one credential set per command

Status: accepted. Date: 2026-09-29.

## Context

`meili` talks to two APIs with different credentials:

- the Meilisearch API, on a URL that changes per instance, with an API key sent as a Bearer token
- the Management API, on one fixed URL, with a token sent as a Bearer token

A command needs exactly one of the two. Suppose the CLI resolved both on every call. An agent that only wants `meili get indexes` would then fail because a management token is missing, even though it does not need one. Error messages would also talk about credentials the command never uses. If each command resolved its own credentials, the resolution order would drift from one command to the next.

## Decision

- Every command declares the API it uses: `static api = "meilisearch" | "management" | "none"`.
- `BaseCommand` owns credential resolution and client construction. It resolves only the declared API and builds only that client. Its errors name only the sources of that API.
- A Meilisearch project comes only from flags, given on every command. The Management API token comes from the session of `meili auth login` (ADR 0009), or from `MEILI_MANAGEMENT_TOKEN` for development and tests. The sources are documented in `docs/contract/config.md`.
- Meilisearch connections come from flags. The Management API connection comes from the session or a development variable. No decision is made about a config file. If one comes, it comes with its own ADR.
- Management commands have no prefix. The resource tells which API a command talks to (`get projects`, `add teams`), and `static api` tells which credentials it needs. Today no resource name exists in both documents. A collision would be an exception in `commands.md`.

## Consequences

- A command file contains no credential logic. Reviewers check one line, `static api`.
- Error messages are precise. A Meilisearch API command without URL exits 2 and names the flags. A management command without token exits 3 and says to run `meili auth login`. Neither mentions the other API.
- The configuration contract fits on one screen, and `meili --help` documents all of it.
- Adding a third API later means adding a value to `api` and one resolver in `BaseCommand`, without touching commands.
- The CLI prints the response of each API as it is. The two APIs sometimes spell a field differently: `apikey` on a Cloud project, `apiKey` in Meilisearch settings. The output keeps each spelling. An agent that reads the reference of an API finds the same names in the CLI output.
