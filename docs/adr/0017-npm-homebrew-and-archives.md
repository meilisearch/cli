# ADR 0017: Distribution on npm, Homebrew and archives with Node inside

Status: accepted. Date: 2026-11-04.

## Context

ADR 0001 says: "`@meilisearch/cli` on npm, and nothing else until a user asks for it." This was right for coding agents, which run where Node is. But `meili teleport` (ADR 0015) is for humans, and a human who wants to try Meilisearch Cloud does not always have Node. On macOS, humans install command line tools with Homebrew. On Linux and macOS, many tools also install with one `curl … | sh` line, with no package manager.

This ADR replaces the "Distribution" paragraph of ADR 0001. The rest of ADR 0001 still holds.

## Decision

Every version ships on three channels, from the same commit, with no human step:

- **npm**: `npm install -g @meilisearch/cli`. It stays the normal path for agents.
- **Homebrew**: `brew install meilisearch/tap/meili`, from the formula of the `meilisearch/homebrew-tap` repository. The formula installs the npm package and depends on Homebrew's `node`, as the formulae of Node tools in `homebrew/core` do.
- **Archives with Node inside**, for macOS and Linux, on x64 and arm64, attached to the GitHub release: `pnpm archives` builds them with `oclif pack tarballs` and the Node of `.node-version`. `scripts/install.sh` downloads the archive of the machine, checks it against `SHA256SUMS`, puts it in `~/.local/share/meili`, and links `meili` in `~/.local/bin`. It needs no `sudo` and never changes a shell profile: it prints the line to add when `~/.local/bin` is not in `PATH`.

The release runs in `.github/workflows/release.yml`, on `main`, after the tests. `changesets/action` opens the "Version Packages" pull request. When this pull request is merged, it publishes on npm, then two jobs attach the archives to the GitHub release and push the formula to the tap.

Refused:

- **`homebrew/core` for the first versions.** Homebrew accepts a new formula only when the repository shows public interest: for a self-submission, 225 stars, 90 forks or 90 watchers. `meilisearch/cli` is new. The formula of the tap has the shape that `homebrew/core` expects, so it can move there later, and `brew install meili` will then work.
- **One executable file** (Node single executable applications, `bun build --compile`). oclif loads each command from its own file in `dist/commands`, so the CLI would need a bundler first.
- **Windows archives.** Windows users install with npm until one asks for something else.

## Consequences

- An archive weighs about 50 MB, most of it Node.
- An archive runs on Linux with glibc. Alpine and other musl systems use npm.
- A new Node version in `.node-version` changes the Node of the archives at the next release.
- npm accepts the version from the job through trusted publishing (OIDC), so no npm token is stored in GitHub. Trusted publishing is set up on a package that exists, so a maintainer published `0.0.0` by hand once, to create `@meilisearch/cli`.
- The `MEILI_BOT_GH_PAT` token opens the "Version Packages" pull request, so CI tests it, and it pushes to the tap.
