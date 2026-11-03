# ADR 0011: Cloud identifiers in the config file, synced from Meilisearch Cloud

Status: accepted. Date: 2026-11-03. Supersedes ADR 0006.

## Context

ADR 0006 gave a config file entry a `cloudId`, the project's `id` in Meilisearch Cloud, so that `--project <name>` names a project on the management commands too. It set the id three ways: `add projects --sync-config`, which adds the project it creates with the master key creation returns, and `config set` or `config update` with `--project-cloud-id`, the id typed by hand. A key written after creation was the human's choice, never the CLI's.

In practice the id is the hard part. The Cloud dashboard does not show it, and a user with ten projects across three teams types ten ids and ten keys copied from ten pages. The Management API knows all of it: `GET /api/v2/projects` lists the projects the token sees, and `GET /api/v2/projects/{projectId}/master-key` returns a project's master key to the owners of its team or organization. A user who is only a member gets a 403 there.

A first `config sync-with-cloud` set `cloudId` on the entries whose URL was a Cloud project, and never added an entry or wrote a key. It was withdrawn before release: it saved the typing of the id but left the key, the other half, to the human.

## Decision

- **`cloud` in the config file.** An entry has `url`, optionally `apiKey`, and optionally `cloud`, the identifiers of its project in Meilisearch Cloud: `{"id": 343, "teamId": 12, "teamName": "Search"}`. `id` is required in `cloud`, `teamId` and `teamName` are optional. It replaces `cloudId`. `teamId` and `teamName` are there for the human and the agent who read the file; no command reads them.
- **`--project <name>` stands for `--id`** on a management command that acts on one project, through `cloud.id`. `--project` with `--id` is `cli_usage`. An entry without `cloud` is `cli_config` with a hint to `meili config update --project <name> --sync-with-cloud`. A command that reaches no project, `add projects`, does not offer `--project` at all (ADR 0010). The CLI never resolves the id by itself when a command runs, from the URL or otherwise.
- **The Management API is consulted for the file only when the command line asks for it.** The rule of ADR 0005 stays for the ambient resolution; an explicit request is not deduction. Four requests write `cloud`:
  1. `meili config sync-with-cloud` with one scope flag, `--all`, `--team-ids`, `--project-name` or `--project-url`: every Cloud project of the scope gets an entry, the one the file has or a new one.
  2. `meili config set … --sync-with-cloud`: the new entry is the Cloud project with its URL.
  3. `meili config update … --sync-with-cloud`: the entry is synced with its Cloud project.
  4. `--sync-config` on `add projects`, `update projects` and `delete projects`: the entry follows the command.
- **`cloud` is never typed by hand on the command line.** `--project-cloud-id` is gone from `config set` and `config update`: the identifiers come from the API. A human can still write them in an editor.
- **The CLI writes a master key only into an entry without a key.** A key already in the file, or given with `--project-api-key`, is never replaced: it may be a key with fewer rights than the master key, chosen on purpose. When the key is not readable, a 403 for a member who is not an owner, the entry is written without it and a warning says to ask an owner and run `meili config update --project <name> --project-api-key -`. An entry without a key still serves the management commands, through `cloud.id`.
- **An existing entry is recognized by `cloud.id`, else by its URL**, same scheme and host, among the entries without `cloud`. The URL match happens once, on request, and its result is written down where the human sees it; it is not the resolution at command time that ADR 0005 refuses. Two entries without `cloud` on the URL of one project are `cli_config`: the CLI does not pick one.
- **A new entry is named after its project**, and becomes `<name>-<id>` when its name is the name of another project of the same run or of an entry that is not that project's. The suffix is the project's id, unique in the Cloud. A warning says the name chosen. A suffixed name the file already has is `cli_config`.
- **The command line names the scope; nothing is removed.** An entry whose project the Cloud no longer shows is kept, and not reported.
- **An anomaly is reported, never corrected**: an entry recognized by `cloud.id` whose URL is not the one the Cloud gives keeps its URL, with a warning.
- **The file is written once, when every call has answered.** A 403 on the master key is the only error a sync goes on through; any other error leaves the file as it was.
- **`config set` and `config update` call the Management API only with `--sync-with-cloud`.** Without it they resolve nothing and work offline, as before. Their API depends on that one flag.
- **The name `cloud`** is allowed in commands, flags and fields where the product is meant, `sync-with-cloud`, `cloud.id`: the product is Meilisearch Cloud, at cloud.meilisearch.com. `management` names the API, `MEILI_MANAGEMENT_URL`.
- **A parent parameter of the Management API keeps its API name**, `{projectId}` is `--project-id`, because `--project` names an entry.

## Consequences

- A user who created projects in the dashboard runs `meili config sync-with-cloud --all` once, gets an entry per project with its key when they own it, and names them with `--project` on every command, Meilisearch or management.
- The file of a member holds entries without a key, with a warning per entry that says whom to ask.
- `config set` and `config update` lose `--project-cloud-id` and gain `--sync-with-cloud`, which reaches the Management API through the session of `meili auth login`. `meili schema` prints `"api": "none"` for them: the API they need without `--sync-with-cloud`.
- `--id` and `--project-id` are not required flags on the Management API, and `test/contract/api.test.ts` knows it.
- `config.md` describes the `cloud` field and the four requests in "Cloud projects"; `commands.md` lists `config sync-with-cloud` among the commands without an API, since it has no route of its own.
