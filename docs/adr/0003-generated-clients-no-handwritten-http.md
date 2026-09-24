# ADR 0003: Generated clients, no handwritten HTTP

Status: accepted. Date: 2026-09-23.

## Context

Handwritten HTTP clients drift from the API: untyped bodies, query strings built by string concatenation without URL encoding, the same parameters copied across commands. When a coding agent writes HTTP calls by hand, it also invents endpoints and fields that do not exist. We want the compiler to reject a call to something that does not exist.

## Decision

- Engine API: `meilisearch-js`, the official SDK. When the SDK lacks a route, the fix goes to the SDK first, and the CLI uses `client.httpRequest` from the SDK as a temporary measure with a link to the SDK issue.
- Management API (Meilisearch Cloud): a client generated with `@hey-api/openapi-ts` from the spec committed at `openapi/management.yaml`, into `src/lib/clients/management/generated/`. Generated files are committed and never edited by hand. `pnpm gen:management` regenerates them. CI fails if the committed files differ from a fresh generation. The spec is updated by pull request, in the same pull request as the commands it enables.
- No `fetch` outside `src/lib/clients/`.

## Consequences

- A new management API endpoint reaches the CLI by updating the OpenAPI spec and regenerating. The OpenAPI spec must stay accurate. This is a useful side effect.
- Types come from the SDK and the generator, so `--help` descriptions and output shapes cannot drift from the API without a compile error.
- The CLI depends on the release cadence of `meilisearch-js` for new engine features.
