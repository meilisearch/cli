# ADR 0005: TypeScript with oclif v5

Status: accepted. Date: 2026-09-24. Supersedes ADR 0001.

## Context

ADR 0001 chose TypeScript and oclif v4. When the implementation started, on 2026-09-24, `@oclif/core` 5.0.1 was the current major and its only new requirement, Node 22 or newer, was already ours. Starting a new code base on the previous major would mean a migration in the first months of the project, on a command tree that agents already depend on.

Nothing else in ADR 0001 changes. This ADR restates the whole decision so that one file describes the current state.

## Decision

TypeScript, strict mode, Node 22 or newer.

oclif v5 (`@oclif/core` 5, `oclif` CLI 6 for the manifest) as the command framework, for three reasons:

- one class per command in one file, which gives every command the same shape
- a generated JSON manifest of every command, argument and flag, which is what `meili schema` prints so that an agent can learn the CLI in one call
- mature packaging: `oclif pack tarballs` embeds Node for users who do not have it

Engine API through `meilisearch-js`, the official SDK. Management API through a client generated from its OpenAPI spec (see ADR 0003).

Distribution: `@meilisearch/cli` on npm is the source of truth. Tarballs with embedded Node on GitHub Releases and a Homebrew formula derive from each release. A Docker image is not planned until a user asks for one.

## Consequences

- Startup costs 150 to 300 ms. Acceptable for a tool that calls a remote API.
- Agents install once with `npm install -g @meilisearch/cli` and then call `meili` directly. `npx -y @meilisearch/cli` is the zero-setup fallback, not the nominal path.
- Users without Node use the tarball or Homebrew. They never see TypeScript.
- Parity with the engine API follows the release cadence of `meilisearch-js`.
- The next oclif major is a new ADR, not an edit of this one.
