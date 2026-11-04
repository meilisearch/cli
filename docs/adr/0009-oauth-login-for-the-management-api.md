# ADR 0009: `auth login` gets a Management API token through OAuth, and keeps it in a credentials file

Status: accepted. Date: 2026-10-20. One point is superseded by ADR 0014: the client id is `meilisearch-cli` on every Cloud, no longer a built-in id for Meilisearch Cloud only.

## Context

Until now, the Management API accepted one credential: a personal access token, pasted into `MEILI_MANAGEMENT_TOKEN`. An administrator creates it in the dashboard and copies it into a shell profile or a secret manager. It stays valid until someone revokes it. `config.md` left the rest open: "Storing a token on disk, with a `login` command, is a decision of the Management API milestone."

Meilisearch Cloud now runs its own authorization server, Doorkeeper, on the same two hosts as the product. The dashboard serves the consent page, `/oauth/authorize`. The API serves the token and revocation endpoints, `/oauth/token` and `/oauth/revoke`. `grant_flows` is `authorization_code` only, and `force_pkce` is on. `api/app/controllers/api/v2/application_controller.rb` accepts an OAuth access token wherever it accepts a PAT, with `read` for the GET routes and `write` for the others. A token is valid for one hour and comes with a refresh token.

This is what that server expects from a CLI. It was checked against a local Cloud, not assumed:

- a **public client**: `Application.by_uid_and_secret` returns the application when the secret is blank and the application is not confidential. So the CLI authenticates with its client id alone. It holds no secret, and it could not keep one secret anyway.
- a **loopback redirect**: `URIChecker.matches?` implements RFC 8252 section 7.3. So a URI registered as `http://127.0.0.1/callback` matches a redirect to any port on the same address. The CLI can take a free port for each login instead of reserving one.
- **registration in plain HTTP**: `force_ssl_in_redirect_uri` defaults to `!Rails.env.development?`. So registering that loopback URI fails outside a development machine, until the Cloud allows the two literal loopback addresses. That change is `meilisearch-cloud#8025`. This decision needs it first in staging and production, but not in local development.
- **revocation**: `POST /oauth/revoke` is routed and works for a public client, with the client id and the token. Revoking a refresh token also revokes its access token. `/oauth/authorized_applications` does not exist: it is the endpoint that would list and revoke a person's grants from the dashboard. A client that revokes its own token does not need it.

Alternatives considered:

- **Keep PATs only.** The token is long-lived, copied by hand, and has access to everything the user can do. There is nothing to build and nothing to refresh, but also no way to end a session from the CLI. And users cannot create one: only an administrator can.
- **The device authorization grant (RFC 8628)**, a code to type on a web page. It is the right flow for a terminal with no browser, and Doorkeeper supports it as a separate grant. The Cloud does not enable it today. It also asks the human to copy a code, while the loopback flow asks for nothing.
- **A token printed by the dashboard, pasted into `auth login`.** That is a PAT with more steps.
- **Keeping the session in the config file.** There would be only one file to know about. But it mixes a file that a human edits and shares with a secret that the CLI rotates without telling them. `config list` would have to mask it. And `MEILI_CONFIG`, meant to give an agent a read-only set of projects, would also give it a writable token.

## Decision

- **Four commands without an API, `auth login`, `auth status`, `auth refresh` and `auth logout`**, in the table of `commands.md`. They call neither API of the contract. No OpenAPI document here describes the authorization server, so no route derives their name. They sit next to the `config` commands. Like them, they are for humans.

- **`auth login` runs the authorization code flow with PKCE**, as a native application does (RFC 8252). It starts a server bound to `127.0.0.1` on a free port and prints the consent URL on stderr. It opens the URL in a browser unless `--no-browser` is set. Then it waits for the redirect, checks the `state` it sent, and exchanges the code with its verifier. It writes nothing on stdout: what it produces is a file, as for `config set`. The data is in `auth status`. The browser is only a convenience. The URL is always printed, so a session over SSH works: the human opens the URL on another machine.

- **It is the one command that waits for a human**, and `commands.md` says so. It never prompts and never reads stdin. It waits five minutes for an HTTP request that the human causes, then fails with `cli_timeout` and exit 5. Everything else in the CLI stays non-interactive. An agent never runs it: the agent uses the session a human logged in with.

- **The session goes to `credentials.json`, next to the config file**, with mode `600`, and is written atomically. `MEILI_CONFIG` moves both files, so the isolation a human sets up for an agent also covers the token. The file holds the client id and the two URLs with the tokens, so refreshing and revoking later need no flag.

- **The session is the way in, and the CLI offers no other.** Today, only an administrator can create a personal access token in the dashboard. So a `--management-token` flag would document a way in that users do not have. `MEILI_MANAGEMENT_TOKEN` stays, with no flag, for development and tests against another Cloud. There, it takes priority over the session: a token given to a process is an explicit instruction. `MEILI_MANAGEMENT_URL`, `MEILI_MANAGEMENT_DASHBOARD_URL` and `MEILI_MANAGEMENT_CLIENT_ID` point `auth login` and the management commands to that other Cloud. They have no flag either.

- **Expiry is handled where credentials are resolved.** Before it calls the API, a management command checks its access token. If less than thirty seconds are left, it exchanges the refresh token for a new pair and writes the pair back. A session without a refresh token, or one that the server refuses, is `cli_auth_failed`.

- **A token never leaves the Cloud that issued it, and never unencrypted.** The session stores the URL that issued it. Every URL of the flow must be HTTPS unless its host is a loopback address. `config.md` states both rules. They exist because a token sent to the wrong Cloud, or over plain HTTP, is a token given away.

- **A new error code, `cli_auth_failed`, exit 3.** `cli_auth_missing` means the CLI has no credential. `cli_auth_failed` means the authorization server refused to give one or to accept one: a denied consent, an expired refresh token, a revoked application. Both exit 3. The table of `output.md` already defines exit 3 as a failed authentication or authorization.

- **`auth status` asks the server, not the file.** A session is a file plus what a server still thinks of it. Only the server can answer "am I logged in". `auth status` calls `GET /oauth/token/info` and answers like every other command. When the session is live, it prints the session on stdout. When it is not, it prints one error on stderr and nothing on stdout. A command never prints a result next to an error. And `loggedIn: true` next to exit 0 would repeat what the exit code already says. Without `auth status`, proving that `auth logout` worked means reading a private file and writing a `curl` by hand.

- **`auth refresh` makes the implicit refresh explicit.** Commands refresh on their own when the access token expires. This is invisible and happens at the worst moment. `auth refresh` rotates the stored pair on demand. So a human can extend a session before a long run, and find out right away whether the refresh token still works. It writes the same file through the same function as the implicit path, so there is one way to rotate a session, not two.

- **`auth logout` revokes both tokens, then forgets the session whatever happened.** It revokes the refresh token and the access token, each with its `token_type_hint`. It revokes both because RFC 7009 only says that revoking one SHOULD revoke the other, and not every server does it. The file is removed even when the revocation fails: the CLI must stop using a session even when it cannot end it remotely. But the command then exits with the code of what failed, `cli_network` or `cli_auth_failed`, and says that the token stays valid until it expires. Exiting 0 there would tell a script that a live token is gone. With no session, it does nothing and exits 0.

- **The client id is built in for Meilisearch Cloud.** A client id is public by definition, so it is not a secret in the binary. `MEILI_MANAGEMENT_CLIENT_ID` names the application of another Cloud. It is required as soon as the two URLs name another Cloud: an application belongs to the Cloud that registered it.

## Consequences

- A human runs `meili auth login` once. Then the management commands work for as long as the refresh token is valid, with no token in a shell profile and no secret on a command line.
- An agent uses the session a human logged in with. An agent that was given a config file gets the session next to that file, or no session if there is none there.
- The CLI holds a refresh token on disk. It is long-lived, and `auth logout` is the way to end it. The file is `600`, and the CLI warns when it is not.
- From now on, `src/lib/config.ts` resolves credentials asynchronously, because refreshing is a network call. `BaseCommand` awaits it. The call goes through `src/lib/clients/oauth.ts`, which keeps every `fetch` of the CLI in `src/lib/clients/`.
- Two environment variables join the table, and one error code joins `output.md`.
- `meilisearch-cloud#8025` must be merged and deployed before a CLI application can be registered anywhere other than a development machine. The consent page of the dashboard is behind the `VITE_FF_TMP_OAUTH` flag. This flag must be on in the environment the CLI points to.
- Not decided here: what `auth login` does with several Clouds at once. For now there is one session at a time, and the next login overwrites it, the way one config file holds one set of projects. A second session would need a name, as projects have.
