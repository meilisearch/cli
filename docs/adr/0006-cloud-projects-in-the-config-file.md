# ADR 0006: Cloud projects in the config file, the Management API consulted only on request

Status: superseded by ADR 0011. Date: 2026-10-15.

## Context

A management command acts on a Meilisearch Cloud project identified by its integer `id`, `meili update projects --id 343`. That id is not shown in the Cloud dashboard, only in the URL of a page. The config file of ADR 0005 names projects for the Meilisearch commands, with a URL and a key, and `--project <name>` is the handy way to target one; on a management command it was ignored in silence, and the user had to find an id.

Many users create their projects in the dashboard and want the CLI, and the agent behind it, to act on them. ADR 0005 rejected resolving a project through the Management API because not everyone has Cloud, and because a resolution that runs before a command chooses its target in the user's back.

The Management API returns a project's master key at its creation only: `GET /projects` does not carry it.

## Decision

- **`cloudId` in the config file.** An entry has `url`, optionally `apiKey`, optionally `cloudId`, the project's `id` in Meilisearch Cloud. On a management command, `--project <name>` supplies the id from the entry: `--id` of the `projects` commands and `--project-id` of their sub-resources are optional. `--project` with `--id` is `cli_usage`; an entry without `cloudId` is `cli_config` with the ways to set it; a command that reaches no project, `add projects`, does not offer `--project` at all (ADR 0010). The id is never resolved by the CLI itself, from the URL or otherwise.
- **The Management API is consulted only when the command line asks for it**, never to resolve the target of a command. The rule of ADR 0005 stays for the ambient resolution; explicit requests are not deduction. Three ways set `cloudId`: `add projects --sync-config`, which adds the created project as an entry named after it; `config set --project-cloud-id`, a new entry with the id by hand; `config update --project-cloud-id`, the id given to an existing entry.
- **`--sync-config` writes the master key** on `add projects`, as the entry's `apiKey`: creation is the one moment the API returns it, and an entry without its key serves no Meilisearch command. A key written later is the human's choice, through `config set`, `config update` or the editor.
- **`--sync-config` keeps the file in step on `update projects` and `delete projects`**: the entry is renamed after the project, or removed. It is the entry `--project` names, else the one whose `cloudId` is `--id`; none or several is `cli_config` before the call, so a project is never changed while its entry cannot follow. The file is written only once the API has answered.
- **`config update` changes an entry in place**, the fields given and no other, and refuses a name the file does not have. This supersedes the point of ADR 0005 where an entry was changed by `config unset` then `config set`: setting `cloudId` on an existing entry would otherwise mean typing its key again.
- **The name `cloud`** is allowed in commands and fields where the product is meant, `--project-cloud-id`, `cloudId`: the product is Meilisearch Cloud, at cloud.meilisearch.com. `management` names the API, `MEILI_MANAGEMENT_URL`. ADR 0004's rule that kept `Cloud` to prose is dropped.
- **A parent parameter of the Management API keeps its API name**, `{projectId}` is `--project-id`, because `--project` is the global flag that names an entry.

Alternatives considered:

- **Refusing `--project` on management commands.** Honest and minimal, but it gives up the one way to name a project without its id.
- **Resolving the id from the entry's URL at command time.** One hidden request before each command, a URL match that can be wrong in silence: the ambient deduction ADR 0005 refuses.
- **A `--sync-config <name>` that names the entry.** One more thing to type; the entry is named after the project.
- **`--sync-config` finding the entry by URL.** The URL of a Cloud project does not change on rename, but a match on it is the deduction ADR 0005 refuses; `--project` and `cloudId` are explicit.

## Consequences

- A user who created projects in the dashboard writes their entries with `config set`, URL, key and `--project-cloud-id`, or gives the id to an existing entry with `config update`, and names them with `--project` on every command, Meilisearch or management.
- `--id` and `--project-id` are not required flags on the Management API, and `test/contract/api.test.ts` knows it.
- `commands.md` gains the `--sync-config` flag, the `--project-cloud-id` flag of `config set`, `config update` and the `--project-id` rule; `config.md` gains the `cloudId` field and the "Cloud projects" section.
