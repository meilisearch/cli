# @meilisearch/cli

## 0.2.0

### Minor Changes

- **Breaking:** Rename every command: the resource comes first, then the verb. An old name answers with a hint that gives the new one.

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

  `meili search`, `meili similar`, `meili facet-search`, `meili multi-search`, `meili export`, `meili schema`, `meili teleport`, `meili auth` and `meili config` keep their names.

  `--id` is no longer an alias of `--ids` on `task list`, `task cancel`, `task delete`, `batch list`, `document list` and `document delete`: use `--ids`.

- **Breaking:** Remove `--output`, `-o`, `MEILI_OUTPUT` and the `ndjson` mode. Every command prints JSON, as `--output json` did: drop the flag from your scripts. `--all` prints every page as one list.
- Add `meili task view`, `meili batch view` and `meili document view`.
- Add `meili version`.
- Add `meili organization list`, `view`, `update` and `delete`.
- Add `meili team list`, `view`, `add`, `update` and `delete`.
- Add `meili region list`.
- Add `meili resource list`.
- Change `meili auth status`: prints the logged-in user.
- Change `meili auth login`: prints only the URL to open.
- Change `meili auth logout`: says when nobody was logged in.

### Patch Changes

- Change the tips of `meili teleport`.

## 0.1.0

### Minor Changes

- Add `meili`, the Meilisearch CLI: first version.
