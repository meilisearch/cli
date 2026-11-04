# ADR 0018: Resource first, in the singular: `meili index list`

Status: accepted. Date: 2026-11-04. Supersedes the grammar of ADR 0003: the verb first, the plural resource, and one command for the list and the unit routes.

## Context

ADR 0003 chose the grammar of `kubectl`: `meili <verb> <resources> [flags]`, for example `meili get indexes --id movies`. The verb is first, and the resource is plural. One command covers the list route and the unit route, and `--id` selects the unit route.

Human users got lost in the `--help`. `meili --help` lists about ten verbs: `get`, `add`, `update`, `delete`, `cancel`… It does not show the resources. To find what the CLI can do with an index, a human opens `meili get --help`, then `meili add --help`, then `meili update --help`, then `meili delete --help`. A human thinks in resources first ("what can I do with my keys?"), not in verbs.

Agents are not affected in the same way. They learn the CLI from `meili schema` (ADR 0008), not from `--help`. They also handle the grammar of `gh` well, `gh pr list`, which is as common in their training data as the grammar of `kubectl`.

The project is at its start. Every command name will change, and no compatibility layer is needed. Later, such a change would cost much more.

Alternatives considered:

- **Keep the verb first and improve `meili --help`.** The root help could list every command. But the tree stays organized by verb, so `meili get --help` stays the only place to see the resources, and the completion of the shell still offers verbs first.
- **Resource first, in the plural**, `meili indexes list`. `gh`, `az`, `gcloud` and `stripe` use the singular. `meili index add --id movies` reads better than `meili indexes add --id movies`, and ADR 0003 already noted that `add indexes --id movies` looks strange.
- **The verbs of `gh`**, `create` and `edit`. `add` stays: it is the word of the API for documents, `documents.add`, and documents are the most typed write. `update` stays next to it, to keep one verb per HTTP method, as ADR 0003 decided.
- **One command for the list and the unit routes**, as before: `meili index get` and `meili index get --id movies`. A singular name that returns a list surprises the reader. `gh` separates `list` and `view`.
- **Hidden aliases for the old names**, for one release. The project is at its start, and few scripts use the CLI. An alias is a second spelling to maintain and to document. The changelog lists every old name with its new name.
- **Positional identifiers**, `meili index view movies`, as in `gh`. Not now. Every value stays in a named flag (ADR 0003). The usage error gives a hint instead.

## Decision

- **The grammar is `meili <resource> <verb> [flags]`.** The resource is the topic, the verb is the command: `meili index list`, `meili document add --index movies --file movies.json`, `meili task cancel --ids 1,2`.
- **The resource is singular**, in kebab-case: `index`, `document`, `key`, `task`, `batch`, `project`, `organization`, `team`, `team-member`, `region`, `resource`, `field`, `dump`. Singular forms are not derived by a rule. `src/lib/api-naming.ts` holds a table from the API name to the CLI name, and each new resource adds a row. A resource that is one object and not a collection keeps its API name: `settings`, `stats`, `health`.
- **`GET` gives two verbs.** A route that returns a list is `list`: `meili index list`, `meili task list --statuses failed`. A route that returns one item is `view`: `meili index view --id movies`, `meili task view --id 42`, `meili settings view --index movies`. The other verbs do not change: `POST` is `add`, `PUT` and `PATCH` are `update`, `DELETE` is `delete`. The literal verbs stay a closed list: `cancel`, `compact`, `swap`, and the others of `commands.md`.
- **`view` calls the unit route.** Tasks, batches and documents have one: `GET /tasks/{task_id}`, `GET /batches/{batch_id}`, `GET /indexes/{index_uid}/documents/{document_id}`. Before, `get tasks --ids 42` filtered the list instead. So `view` prints the API body of one item, with no list envelope. `list` keeps `--ids` to filter several items. The `--id` alias of `--ids` is removed from the commands that filter by identifiers: `view` takes `--id`.
- **A resource whose only command is `view` has no verb**: `meili health`, `meili stats [--index movies]`. `VIEW_ONLY` in `src/lib/api-naming.ts` lists these resources.
- **`meili version` is the version of the CLI, and `GET /version` is `meili info`.** Everyone reads `meili version` as the version of the CLI, as in `gh version` and `docker version`. `meili version` prints it as JSON, and `meili --version` stays. The route of the instance takes `info`: its version and the commit it was built from. `info` is in the exceptions table of `commands.md`. `PATCH /api/v2/projects/{projectId}/version` gets no command for now, because its derived name, `version update`, would collide.
- **The commands without a resource stay at the root**: `search`, `similar`, `facet-search`, `multi-search`, `export`, `schema`, `teleport`. `auth` and `config` already followed this grammar and do not change.
- **`meili --help` gives the full tour.** It lists every resource with its commands on one screen, grouped by the API whose routes they implement: the CLI first, for the commands without a route, then Meilisearch, then the Management API of Meilisearch Cloud. Nobody needs to open a second help to know what exists.
- **A wrong command gets a hint, never a guess.** The `cli_usage` error suggests the closest existing command, computed from the manifest. It covers the old order (`meili get indexes` → `meili index list`), the plural (`meili indexes list` → `meili index list`), the verbs of `gh` (`create` → `add`, `edit` → `update`) and a positional value (`meili index view movies`: the hint says that every value goes in a named flag, and points to `meili index view --help`). The CLI still never runs a command the user did not write.
- **The rest of ADR 0003 holds**: the OpenAPI documents are the reference, flags derive from the routes, every value is a named flag, `add` and not `create`, HTTP stays in `src/lib/clients/`.

## Consequences

- Every command is renamed. This is a breaking change. The changeset lists every old name with its new name.
- Files move: `src/commands/get/indexes.ts` becomes `src/commands/index/list.ts` and `src/commands/index/view.ts`. A command of the verb `delete` is now a file named `delete.ts`. The contract test of ADR 0007 checks these files for `--yes`, in place of the `src/commands/delete/` folder.
- Each `get` command that covered a list route and a unit route becomes two commands. There are more commands, but each one has fewer flags and one route.
- The routes `GET /tasks/{task_id}`, `GET /batches/{batch_id}` and `GET /indexes/{index_uid}/documents/{document_id}` leave the exceptions of `commands.md`: `view` implements them.
- `meili schema --command` takes the new names: `meili schema --command "index list"`. An agent that kept an old schema must read it again.
- The analytics events of ADR 0016 carry the command name. The series before and after this change do not join.
- `commands.md`, the README, the skills of `.claude/skills/`, the hints of the errors and the tips of `meili teleport` change in the same pull request.
