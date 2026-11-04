# ADR 0016: The CLI sends anonymous usage events to PostHog, and joins them to the Cloud user after login

Status: accepted. Date: 2026-11-04.

## Context

We do not know how the CLI is used: which commands run, which flags, which errors stop people, where a human leaves `meili teleport` (ADR 0015). Meilisearch Cloud already measures its dashboard with PostHog, in the project "Meilisearch (production)". The owner of that project wants the CLI events in the same project, so that one person has both their dashboard and their CLI activity.

How Cloud identifies a person in PostHog:

- `distinct_id` is the user's UUID. It is not the email or the numeric id. www.meilisearch.com and Segment use the same UUID.
- Cloud sets the person properties: `email`, `name`, `company`, `highest_plan`, `number_of_teams`, `is_internal`, and `signed_up_at` once.
- Events go through `https://t.meilisearch.com`, a proxy to the EU PostHog. The project creates person profiles for identified users only.
- Cloud adds `site: "app"` to every event.

`GET /api/v2/me` returns `{ name, email }` today. It will also return the UUID, as `id`. Identification needs this field. Anonymous events do not.

The CLI is often run by agents, in CI, and in containers. Many users only use the Meilisearch API, never log in to Cloud, and are never identified.

Alternatives considered:

- **No analytics.** Nothing to build and nothing to explain. But every decision about the CLI stays a guess.
- **Opt-in.** This is the safest choice for privacy. But few people turn it on, so the data shows only the most engaged users.
- **A separate PostHog project for the CLI.** It is isolated and easy to reset. But persons belong to one project, so a CLI user can never be joined to their dashboard activity. The project owner chose the shared project.
- **The email as `distinct_id`.** It is known before `/me` returns the UUID. But it does not match the `distinct_id` of Cloud, so it creates a second person. And an email is personal data in every event.
- **`posthog-node`.** It does queues, retries and flags. The CLI sends a few events per process and needs none of that. One `fetch` to the batch endpoint is enough, so there is no new dependency (rule 9).
- **A key in the config file to opt out.** The config file holds projects and nothing else, and an agent's file is often read-only. An environment variable in a shell profile is persistent enough.

## Decision

### What is sent

- **`cli_command_run`**, once per command, at the end: `command` (`get indexes`), `flags` (the names of the flags given, never their values), `exit_code`, `error_code` (the `code` of the error, a fixed string, or none), `duration_ms`.
- **`cli_prompt_answered`**, once per answer in an interactive command: `command`, `prompt` (a stable id that the command gives each question, such as `region`), `choice` (the stable id of the chosen option, such as a region id or `enter-url`). A free-text answer is never sent: no project name, no URL, no key. The event says only `choice: "custom"`.
- **`cli_prompt_aborted`**, when the human leaves an interactive command: `command`, `prompt`.
- **On every event**: `site: "cli"`, `cli_version`, `os`, `arch`, `node_version`, `tty` (whether stdin and stderr are terminals). `tty` tells a human from an agent or a script.
- **Never sent**: flag values, free text, URLs, index names, documents, keys, tokens, emails. The CLI sets no person property. Cloud sets them from its own data, so the CLI cannot overwrite them with older values.

### Who sends it

- **Before login, an anonymous id.** It is a random UUID, written to `analytics.json` next to the config file. `MEILI_CONFIG` moves it, like `credentials.json`. Anonymous events carry `$process_person_profile: false`, so they create no person profile. When the file cannot be written, for example on a read-only mount, the CLI uses a new id for each process.
- **After login, the user's UUID.** When the CLI writes a new session, in `auth login` or in the login step of `meili teleport`, it calls `GET /api/v2/me` and stores `id` in `credentials.json` as `userId`. It sends one `$identify` event with `distinct_id` set to the UUID and `$anon_distinct_id` set to the anonymous id. After this, every event uses the UUID while the session exists. If `/me` has no `id`, the CLI stays anonymous. It never falls back to the email.
- **`MEILI_MANAGEMENT_TOKEN` does not identify.** The CLI does not call `/me` on every command to find who owns a token. A token is for development and tests.
- **On logout, a new anonymous id.** `auth logout` removes the session, so it removes the UUID too. It also writes a new anonymous id, so the next person on the machine is not merged into the previous one.

### How it is sent

- **From `src/lib/clients/analytics.ts`**, which holds the one `fetch` of this feature (rule 3). `BaseCommand` collects the events of a command and sends them in one request to `https://t.meilisearch.com/batch/`, after the command ends.
- **It never changes the command's result.** The request has a timeout of one second. Every error is ignored. Nothing is written to stdout. Nothing is written to stderr, except in `--debug` traces. The exit code and the output stay the same.
- **The project API key is built in.** A PostHog project key can only write events, so it is not a secret, like the OAuth client id (ADR 0014).

### When nothing is sent

- `MEILI_NO_ANALYTICS` is `true` or `1`. Meilisearch itself uses the same name for the same purpose, so one variable turns off both. It has no flag (rule 14): it is set once, for every process.
- `DO_NOT_TRACK` is `true` or `1`, the shared convention of many CLIs.
- `CI` is set. CI runs are machines, not users, and they include the tests of this repository.
- `MEILI_MANAGEMENT_URL` names a Cloud other than Meilisearch Cloud. User UUIDs of another Cloud do not belong in the production project.

### Telling the user

- The first time the CLI writes `analytics.json`, it writes one notice on stderr when stderr is a terminal. The notice says that anonymous usage data is sent, what is never sent, and how to turn it off with `MEILI_NO_ANALYTICS=true`. It is shown once per file.
- `meili --help` documents `MEILI_NO_ANALYTICS`, and the README has a section on analytics.

## Consequences

- One change implements this ADR. In it, `config.md` gets `MEILI_NO_ANALYTICS` in its table of variables, `analytics.json` next to `credentials.json`, and `userId` in the credentials file. `src/lib/config.ts` declares the variable. This is a contract change, so the code and the docs ship together.
- `cli_command_run` can ship before `GET /api/v2/me` returns `id`. Identification ships after `pnpm gen:management` brings the field.
- Interactive commands give each question and each option a stable id. A new question needs a new id, and a renamed id breaks the funnels in PostHog.
- People who only use the Meilisearch API stay anonymous. Their usage counts, but it is not linked to a customer.
- Before release, someone checks in a dev PostHog project that anonymous events sent with `$process_person_profile: false` are joined to the person after `$identify`. If they are not, only the runs before the first login are lost.
- The privacy policy of Meilisearch must mention the CLI before the first release that sends events.
