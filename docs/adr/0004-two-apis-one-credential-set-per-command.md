# ADR 0004: Two APIs, one credential set per command

Status: accepted. Date: 2026-09-24.

## Context

`meili` talks to two APIs with different credentials:

- the engine API, on a URL that changes per instance, with an API key sent as a Bearer token
- the management API, on one fixed URL, with a personal access token sent as a Bearer token

Most commands need exactly one of the two. If the CLI resolved both on every call, an agent that only wants `meili index list` would fail for a missing management token it does not need, and error messages would talk about credentials the command never uses. If each command resolved its own credentials, the resolution order would drift from one command to the next.

## Decision

- Every command declares the API it uses: `static api = "engine" | "management" | "none"`.
- `BaseCommand` owns credential resolution and client construction. It resolves only the declared API, builds only that client, and produces errors that name only that API's sources.
- Resolution order is the same for both APIs: flag, then environment variable, then config file. The sources are documented in `docs/contract/config.md`.
- The single case that needs both APIs, running an engine command against a Meilisearch Cloud project with `--project <id>`, is handled by `BaseCommand`: it resolves the management API credential, fetches the project, and feeds its `url` and `apikey` into the engine resolution at the context level.

## Consequences

- A command file contains no credential logic. Reviewers check one line, `static api`.
- Error messages are precise: an engine command without URL exits 2 and lists the three ways to give a URL; a management command without token exits 3 and says where to create a token. Neither mentions the other API.
- Adding a third API later means adding a value to `api` and one resolver in `BaseCommand`, not touching commands.
- The two APIs keep their own field naming in the output. The CLI does not normalize between camelCase and snake_case, so what the API documentation shows is what the agent gets.
