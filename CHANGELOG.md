# @meilisearch/cli

## 0.2.0

### Minor Changes

- 739e334: Add `meili region list`.
- a8f973e: Add `meili resource list`.
- 5e3c5dc: Add `meili team list`, `meili team view --id <id>`, `meili team add --organization-id <id>`, `meili team update --id <id>` and `meili team delete --id <id> --yes`.
- 127e157: `auth status` returns the logged-in user (`id`, `name`, `email`). `auth login` prints only the URL to open, and `auth logout` says when nobody was logged in.
- a18a223: Add `meili organization list`, `meili organization view --id <id>`, `meili organization update --id <id>` and `meili organization delete --id <id> --yes`.
- 9045177: **Breaking change: `--output` (`-o`) and `MEILI_OUTPUT` are removed, and so is the `ndjson` mode.** Every command prints JSON, indented in a terminal and compact when piped, as `--output json` did. `--all` prints every page as one list.
- 9045177: **Breaking change: every command is renamed.** The resource now comes first, in the singular, then the verb, as in `gh`: `meili index list` instead of `meili get indexes`. `meili --help` lists every resource with its commands on one screen. See ADR 0018.
  
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

### Patch Changes

- 0c8f828: Update the tips of `meili teleport`.

## 0.1.0

### Minor Changes

- 6c0c7ae: First version of `meili`, the Meilisearch CLI.
  
  Commands:
  
  - `meili get health`, `meili get version`, `meili get stats`
  - `meili get indexes`, `meili add indexes`, `meili update indexes`, `meili delete indexes`
  - `meili get documents`, `meili add documents`, `meili update documents`, `meili delete documents`
  - `meili search`, `meili multi-search`, `meili similar`, `meili facet-search`
  - `meili get settings`, `meili update settings`, `meili delete settings`
  - `meili get tasks`, `meili cancel tasks`, `meili delete tasks`, `meili get batches`
  - `meili get keys`, `meili add keys`, `meili update keys`, `meili delete keys`
  - `meili export`
  - `meili get projects`, `meili add projects`, `meili update projects`, `meili delete projects`
  - `meili auth login`, `meili auth status`, `meili auth refresh`, `meili auth logout`
  - `meili config list`, `meili config set`, `meili config update`, `meili config unset`, `meili config sync-with-cloud`
  - `meili teleport`
  - `meili schema`
