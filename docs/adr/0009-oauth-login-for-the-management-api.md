# ADR 0009: `auth login` gets a Management API token through OAuth, and keeps it in a credentials file

Status: accepted. Date: 2026-10-20.

## Context

Until now the Management API took one credential: a personal access token, pasted into `MEILI_MANAGEMENT_TOKEN`. A human creates it in the dashboard, copies it into a shell profile or a secret manager, and it lives until someone revokes it. `config.md` left the rest open: "Storing a token on disk, with a `login` command, is a decision of the Management API milestone."

Meilisearch Cloud now runs its own authorization server, Doorkeeper, on the same two hosts as the product: the consent page is served by the dashboard, `/oauth/authorize`, and the token and revocation endpoints by the API, `/oauth/token` and `/oauth/revoke`. `grant_flows` is `authorization_code` only, `force_pkce` is on, and `api/app/controllers/api/v2/application_controller.rb` accepts an OAuth access token wherever it accepts a PAT, with `read` for the GET routes and `write` for the others. A token lives one hour and comes with a refresh token.

What that server expects from a CLI, checked against a local Cloud rather than assumed:

- a **public client**: `Application.by_uid_and_secret` returns the application when the secret is blank and the application is not confidential, so the CLI authenticates with its client id alone and holds no secret, which it could not keep anyway.
- a **loopback redirect**: `URIChecker.matches?` implements RFC 8252 section 7.3, so a URI registered as `http://127.0.0.1/callback` matches a redirect to any port on the same address. The CLI can take a free port per login instead of reserving one.
- **registration in plain HTTP**: `force_ssl_in_redirect_uri` defaults to `!Rails.env.development?`, so registering that loopback URI fails outside a development machine until the Cloud allows the two literal loopback addresses. That change is `meilisearch-cloud#8025`, a prerequisite of this one in staging and production, not in local development.
- **revocation**: `POST /oauth/revoke` is routed and works for a public client, with the client id and the token; revoking a refresh token takes its access token with it. What does not exist is `/oauth/authorized_applications`, the endpoint that would list and revoke someone's grants from the dashboard. A client revoking its own token needs none of it.

Alternatives considered:

- **Keep PATs only.** The token is long-lived, copied by hand, and scoped to everything the user can do. Nothing to build, nothing to refresh, and no way to end a session from the CLI.
- **The device authorization grant (RFC 8628)**, a code to type on a web page. It is the right flow for a terminal with no browser, and Doorkeeper supports it as a separate grant. The Cloud does not enable it today, and it asks the human to copy a code; the loopback flow asks for nothing.
- **A token printed by the dashboard, pasted into `auth login`.** That is a PAT with more steps.
- **Keeping the session in the config file.** One file to know about, but it mixes a file a human edits and shares with a secret the CLI rotates behind their back. `config list` would have to mask it, and `MEILI_CONFIG`, meant to hand an agent a read-only set of projects, would hand it a writable token too.

## Decision

- **Four commands without an API, `auth login`, `auth status`, `auth refresh` and `auth logout`**, in the table of `commands.md`. They call neither API of the contract: the authorization server is described by no OpenAPI document here, so no route derives their name. They sit next to the `config` commands, and like them they are for humans.

- **`auth login` runs the authorization code flow with PKCE**, as a native application does (RFC 8252). It starts a server bound to `127.0.0.1` on a free port, prints the consent URL on stderr, opens it in a browser unless `--no-browser`, waits for the redirect, checks the `state` it sent, and exchanges the code with its verifier. It writes nothing on stdout: what it produced is a file, as for `config add`. `auth status` is where the data is. The browser is a convenience: the URL is always printed, so a session over SSH works by opening it elsewhere.

- **It is the one command that waits for a human**, and it says so in `commands.md`. It never prompts and never reads stdin: it waits for an HTTP request that the human causes, for five minutes, then `cli_timeout` and exit 5. Everything else the CLI does stays non-interactive, and an agent that must not wait uses `MEILI_MANAGEMENT_TOKEN`.

- **The session goes to `credentials.json`, next to the config file**, mode `600`, written atomically. `MEILI_CONFIG` moves both, so the isolation a human sets up for an agent covers the token. The file holds the client id and the two URLs with the tokens, so refreshing and revoking need no flag later.

- **The environment still wins.** Resolution is `--management-token`, then `MEILI_MANAGEMENT_TOKEN`, then the session. A token handed to a process is an explicit instruction and overrides a login that happens to sit in the home directory.

- **Expiry is handled where credentials are resolved.** A management command whose access token has less than thirty seconds left trades the refresh token for a new pair and writes it back, before calling the API. A session without a refresh token, or one the server refuses, is `cli_auth_failed`.

- **A token never leaves the Cloud that issued it, and never in the clear.** The session carries the URL it was issued by, and every URL of the flow must be HTTPS unless its host is a loopback address. `config.md` states both rules; the reason they exist is that a token sent to the wrong Cloud, or over plain HTTP, is a token given away.

- **A new error code, `cli_auth_failed`, exit 3.** `cli_auth_missing` means the CLI has no credential; `cli_auth_failed` means the authorization server refused to give one or to accept one: a denied consent, an expired refresh token, a revoked application. Both exit 3, which the table of `output.md` already defines as authentication or authorization failing.

- **`auth status` asks the server, not the file.** A session is a file plus what a server still thinks of it, and only the second answers "am I logged in". It calls `GET /oauth/token/info` and answers like every other command: the session on stdout when it is live, one error on stderr and nothing on stdout when it is not. A command never prints a result next to an error, and `loggedIn: true` next to exit 0 would say twice what the exit code already says. Without it, proving that `auth logout` worked means reading a private file and writing a `curl` by hand.

- **`auth refresh` makes the implicit refresh explicit.** Commands refresh on their own when the access token is spent, which is invisible and happens at the worst moment; `auth refresh` rotates the stored pair on demand, so a human can extend a session before a long run and find out right away whether the refresh token still works. It writes the same file through the same function the implicit path uses, so there is one way to rotate a session, not two.

- **`auth logout` revokes both tokens, then forgets the session whatever happened.** It revokes the refresh token and the access token, each with its `token_type_hint`, because the cascade from one to the other is a SHOULD of RFC 7009 and not every server does it. The file is removed even when the revocation fails, since a session the CLI cannot end remotely is still one it must stop using; but the command then exits with the code of what failed, `cli_network` or `cli_auth_failed`, and says the token stays valid until it expires. Exiting 0 there would tell a script that a live token is gone. With no session, it does nothing and exits 0.

- **The client id is given, not built in.** `--management-client-id`, or `MEILI_MANAGEMENT_CLIENT_ID`. The OAuth application for this CLI does not exist yet on any Cloud; when it does, its `uid` becomes the default here and the flag stays for other environments. A client id is public by definition, so shipping one later is not a secret in the binary.

## Consequences

- A human runs `meili auth login` once and the management commands work for as long as the refresh token lives, with no token in a shell profile and no secret on a command line.
- An agent is unchanged: `MEILI_MANAGEMENT_TOKEN` still wins, and an agent that was given a config file now also gets, or does not get, the session next to it.
- The CLI holds a refresh token on disk. It is long-lived, and `auth logout` is the way to end it; the file is `600` and the CLI warns when it is not.
- `src/lib/config.ts` resolves credentials asynchronously from now on, because refreshing is a network call. `BaseCommand` awaits it. The call goes through `src/lib/clients/oauth.ts`, which keeps every `fetch` of the CLI in `src/lib/clients/`.
- Two environment variables join the table, and `output.md` one error code.
- `meilisearch-cloud#8025` must be merged and deployed before a CLI application can be registered anywhere but a development machine, and the consent page of the dashboard is behind the `VITE_FF_TMP_OAUTH` flag, which has to be on in the environment the CLI points at.
- Not decided here: what `auth login` does with several Clouds at once. One session at a time, overwritten by the next login, the way one config file holds one set of projects. A second session would need a name, like projects have one.
