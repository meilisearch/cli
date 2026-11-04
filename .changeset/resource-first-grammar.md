---
"@meilisearch/cli": minor
---

**Breaking change: every command is renamed.** The resource now comes first, in the singular, then the verb, as in `gh`: `meili index list` instead of `meili get indexes`. `meili --help` lists every resource with its commands on one screen. See ADR 0018.

Reading a resource is now two commands: `list` for the list, and `view --id` for one item. `meili task view --id 42`, `meili batch view --id 7` and `meili document view --index movies --id 42` are new: they print the item itself, with no list envelope. `--id` is no longer an alias of `--ids` on `task list`, `task cancel`, `task delete`, `batch list`, `document list` and `document delete`.

An old name, a plural, or a verb of another CLI gets a hint with the new name: `meili get indexes` answers "Did you mean `meili index list`?". A command followed by a value gets a hint that every value goes in a named flag.

| Before | Now |
|---|---|
| `meili get health` | `meili health` |
| `meili get version` | `meili info` |
| `meili get stats` | `meili stats` |
| `meili get indexes` | `meili index list` |
| `meili get indexes --id <index>` | `meili index view --id <index>` |
| `meili add indexes` | `meili index add` |
| `meili update indexes` | `meili index update` |
| `meili delete indexes` | `meili index delete` |
| `meili get documents` | `meili document list` |
| `meili get documents --index <index> --ids <id>` | `meili document view --index <index> --id <id>`, for the document itself |
| `meili add documents` | `meili document add` |
| `meili update documents` | `meili document update` |
| `meili delete documents` | `meili document delete` |
| `meili get settings` | `meili settings view` |
| `meili update settings` | `meili settings update` |
| `meili delete settings` | `meili settings delete` |
| `meili get tasks` | `meili task list` |
| `meili get tasks --ids <uid>` | `meili task view --id <uid>`, for the task itself |
| `meili cancel tasks` | `meili task cancel` |
| `meili delete tasks` | `meili task delete` |
| `meili get batches` | `meili batch list` |
| `meili get batches --ids <uid>` | `meili batch view --id <uid>`, for the batch itself |
| `meili get keys` | `meili key list` |
| `meili get keys --id <key>` | `meili key view --id <key>` |
| `meili add keys` | `meili key add` |
| `meili update keys` | `meili key update` |
| `meili delete keys` | `meili key delete` |
| `meili get projects` | `meili project list` |
| `meili get projects --id <id>` | `meili project view --id <id>` |
| `meili add projects` | `meili project add` |
| `meili update projects` | `meili project update` |
| `meili delete projects` | `meili project delete` |

`meili version` is new: it prints the version of the CLI as JSON.

`meili search`, `meili similar`, `meili facet-search`, `meili multi-search`, `meili export`, `meili schema`, `meili teleport` and the `auth` and `config` commands keep their names.
