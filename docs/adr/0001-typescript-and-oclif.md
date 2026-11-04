# ADR 0001: TypeScript with oclif

Status: accepted. Date: 2026-09-29.

## Context

`meili` is a command line tool. It talks to the Meilisearch API, and to the Management API that manages Meilisearch Cloud projects. It must be coding agent friendly first. Human comfort comes in the documentation and the help, and later in comfort commands.

Two facts drive the technical choices:

- The CLI must work for coding agents. Agents run in sandboxes where Node and the npm registry are almost always available. They install tools with `npm install -g`.
- Coding agents write most contributions, and humans review them. The code base must be easy to read, fast to build and fast to test. This keeps the agent loop short and the human review cheap.

## Decision

TypeScript, strict mode, Node 22 or newer.

The command framework is oclif v5 (`@oclif/core` 5, the `oclif` CLI 6 for the manifest), for three reasons:

- one class per command, in one file, so every command has the same shape
- a generated JSON manifest of every command and flag: `meili schema` prints it, so an agent can learn the CLI in one call
- mature packaging (`oclif pack`), if we ever need a channel other than npm

The Meilisearch API is reached through `meilisearch-js`, the official SDK. The Management API is reached through a client generated from its OpenAPI document (see ADR 0003).

Distribution: `@meilisearch/cli` on npm, and nothing else until a user asks for it. Agents run where Node is. Tarballs with embedded Node, Homebrew or Docker come when users ask for them.

## Consequences

- Startup takes 150 to 300 ms. This is acceptable for a tool that calls a remote API.
- Users and agents install once with `npm install -g @meilisearch/cli`, then call `meili` directly. `npx -y @meilisearch/cli` is the fallback that needs no setup, not the normal path.
- Parity with the Meilisearch API follows the releases of `meilisearch-js`.
- The next major version of oclif needs a new ADR, not an edit of this one.
