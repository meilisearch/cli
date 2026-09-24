# ADR 0001: TypeScript with oclif

Status: accepted. Date: 2026-09-29.

## Context

`meili` is a command line tool that talks to the Meilisearch API and to the Management API that manages Meilisearch Cloud projects. It is built for coding agents only.

Two facts drive the technical choices:

- The users are coding agents. They run in sandboxes where Node and the npm registry are almost always available, and they install tools with `npm install -g`.
- Most contributions are written through coding agents and reviewed by humans. The code base must be easy to read, fast to build and fast to test, so that the agent loop stays short and the human review stays cheap.

## Decision

TypeScript, strict mode, Node 22 or newer.

oclif v5 (`@oclif/core` 5, the `oclif` CLI 6 for the manifest) as the command framework, for three reasons:

- one class per command in one file, which gives every command the same shape
- a generated JSON manifest of every command and flag, which is what `meili schema` prints so that an agent can learn the CLI in one call
- mature packaging (`oclif pack`), if a channel other than npm is ever needed

Meilisearch API through `meilisearch-js`, the official SDK. Management API through a client generated from its OpenAPI document (see ADR 0003).

Distribution: `@meilisearch/cli` on npm, and nothing else until a user asks for it. Agents run where Node is; tarballs with embedded Node, Homebrew or Docker are for humans.

## Consequences

- Startup costs 150 to 300 ms. Acceptable for a tool that calls a remote API.
- Agents install once with `npm install -g @meilisearch/cli` and then call `meili` directly. `npx -y @meilisearch/cli` is the zero-setup fallback, not the nominal path.
- Parity with the Meilisearch API follows the release cadence of `meilisearch-js`.
- The next oclif major is a new ADR, not an edit of this one.
