# ADR 0006: Cloud projects in the config file, the Management API consulted only on request

Status: superseded by ADR 0011. Date: 2026-10-15.

## Context

A management command acts on a Meilisearch Cloud project. The project is identified by its integer `id`: `meili update projects --id 343`. The Cloud dashboard does not show that id, except in the URL of a page. The config file of ADR 0005 names projects for the Meilisearch commands, with a URL and a key. `--project <name>` is the easy way to target one. But a management command silently ignored it, and the user had to find an id.

Many users create their projects in the dashboard. They want the CLI, and the agent that uses it, to act on these projects. ADR 0005 rejected resolving a project through the Management API for two reasons. Not everyone has Cloud. And a resolution that runs before a command chooses its target without the user knowing.

The Management API returns the master key of a project only when it creates the project. `GET /projects` does not return it.

## Decision

- **`cloudId` in the config file.** An entry has `url`, optionally `apiKey`, and optionally `cloudId`, the `id` of the project in Meilisearch Cloud. On a management command, `--project <name>` gives the id from the entry. So `--id` of the `projects` commands and `--project-id` of their sub-resources are optional. `--project` with `--id` is `cli_usage`. An entry without `cloudId` is `cli_config`, with the ways to set it. A command that reaches no project, `add projects`, does not offer `--project` at all (ADR 0010). The CLI never resolves the id itself, from the URL or in any other way.
- **The Management API is consulted only when the command line asks for it**, never to resolve the target of a command. The rule of ADR 0005 stays: nothing is deduced, and an explicit request is not a deduction. There are three ways to set `cloudId`. `add projects --sync-config` adds the created project as an entry named after it. `config set --project-cloud-id` creates a new entry with the id typed by hand. `config update --project-cloud-id` gives the id to an existing entry.
- **`--sync-config` writes the master key** on `add projects`, as the `apiKey` of the entry. Creation is the only moment the API returns the key, and an entry without its key is useless for every Meilisearch command. Writing a key later is the human's choice, through `config set`, `config update` or the editor.
- **`--sync-config` keeps the file in step on `update projects` and `delete projects`**: the entry is renamed after the project, or removed. The entry is the one that `--project` names, else the one whose `cloudId` is `--id`. If no entry or several entries match, the command fails with `cli_config` before the call. So a project is never changed when its entry cannot follow. The file is written only after the API has answered.
- **`config update` changes an entry in place**. It changes only the fields given, and refuses a name that is not in the file. This supersedes the point of ADR 0005 where an entry was changed by `config unset` then `config set`. Without `config update`, setting `cloudId` on an existing entry would mean typing its key again.
- **The name `cloud`** is allowed in commands and fields that mean the product, like `--project-cloud-id` and `cloudId`. The product is Meilisearch Cloud, at cloud.meilisearch.com. `management` names the API, like in `MEILI_MANAGEMENT_URL`. The rule of ADR 0004 that kept `Cloud` to prose is dropped.
- **A parent parameter of the Management API keeps its API name**: `{projectId}` is `--project-id`. The reason is that `--project` is the global flag that names an entry.

Alternatives considered:

- **Refusing `--project` on management commands.** Honest and minimal, but it loses the only way to name a project without its id.
- **Resolving the id from the entry's URL at command time.** It adds one hidden request before each command, and a URL match can be silently wrong. It is the implicit deduction that ADR 0005 refuses.
- **A `--sync-config <name>` that names the entry.** One more thing to type. The entry is named after the project.
- **`--sync-config` finding the entry by URL.** The URL of a Cloud project does not change when the project is renamed. But a match on the URL is the deduction that ADR 0005 refuses. `--project` and `cloudId` are explicit.

## Consequences

- A user who created projects in the dashboard writes their entries with `config set`: URL, key and `--project-cloud-id`. Or the user gives the id to an existing entry with `config update`. Then the user names the entries with `--project` on every command, Meilisearch or management.
- `--id` and `--project-id` are not required flags on the Management API, and `test/contract/api.test.ts` knows it.
- `commands.md` gains the `--sync-config` flag, the `--project-cloud-id` flag of `config set`, `config update` and the `--project-id` rule. `config.md` gains the `cloudId` field and the "Cloud projects" section.
