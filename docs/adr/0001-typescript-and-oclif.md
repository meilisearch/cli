# ADR 0001: TypeScript with oclif

Status: superseded by ADR 0005. Date: 2026-09-23.

## Context

`meili` is a command line tool that talks to the Meilisearch engine API and to the management API that manages Meilisearch Cloud projects. It is built for coding agents only.

Two facts drive the technical choices:

- The users are coding agents. They run in sandboxes where Node and the npm registry are almost always available, and they install tools with `npm install -g`.
- Most contributions are written through coding agents and reviewed by humans. The code base must be easy to read, fast to build and fast to test, so that the agent loop stays short and the human review stays cheap.

## Decision

TypeScript, strict mode, Node 22 or newer.

oclif v4 as the command framework, for three reasons:

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
