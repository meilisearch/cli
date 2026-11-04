# ADR 0014: `auth login` uses the `meilisearch-cli` application on every Cloud, and opens the sign-up page

Status: accepted. Date: 2026-11-04. Supersedes one point of ADR 0009: the client id is built in for every Cloud, not for Meilisearch Cloud only.

## Context

ADR 0009 built in the client id of the application registered on Meilisearch Cloud. This id was random. Another Cloud, such as staging or a local one, had its own id, so `MEILI_MANAGEMENT_CLIENT_ID` was required as soon as the two URLs named another Cloud.

`meilisearch-cloud#8079` changes two things:

- The Cloud seeds the application of the CLI with a fixed `uid`, `meilisearch-cli`, in every environment. It is a public client with the redirect URI `http://127.0.0.1/callback` and the scopes `read write`. This is what `auth login` already sends.
- The consent page accepts `prompt=create` (OpenID Connect). A human without a session on the dashboard goes to the sign-up page instead of the login page. In an OAuth flow, this page offers GitHub and Google only. It also links to the login page.

Alternatives considered for the sign-up:

- **A `--sign-up` flag on `auth login`, or an `auth signup` command.** The human would have to know, before the browser opens, whether they have an account. The sign-up page already sends a human who has one to the login page, and signing up with GitHub or Google logs in an existing account. A flag would add a choice that the page already handles.

## Decision

- **The client id is `meilisearch-cli` on every Cloud.** It is the default, whatever the two URLs name. `MEILI_MANAGEMENT_CLIENT_ID` stays as an optional override, for development and tests. A Cloud without this application no longer fails with `cli_usage` before the flow. The authorization server refuses the unknown client instead.
- **The consent URL always carries `prompt=create`.** `auth login` is the way in for a human who has an account and for one who does not. It has no new flag.

## Consequences

- `auth login` against staging or a local Cloud needs only the two URLs.
- A user who has no account runs the same command as a user who has one.
- A user without a session who wants to log in with email and password lands on the sign-up page first, and follows its link to the login page.
