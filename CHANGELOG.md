# @meilisearch/cli

## 0.2.0

### Minor Changes

- **Breaking:** Rename every command: the resource comes first, then the verb (`meili index list`).
  An old name answers with a hint that gives the new one.
- **Breaking:** Remove `--output`, `-o` and `MEILI_OUTPUT`. Every command prints JSON.
- Add `meili task view`, `meili batch view` and `meili document view`.
- Add `meili version`.
- Add `meili organization list`, `view`, `update` and `delete`.
- Add `meili team list`, `view`, `add`, `update` and `delete`.
- Add `meili region list`.
- Add `meili resource list`.
- Change `meili auth status`: it prints the logged-in user.
- Change `meili auth login`: it prints only the URL to open.
- Change `meili auth logout`: it says when nobody was logged in.

### Patch Changes

- Change the tips of `meili teleport`.

## 0.1.0

### Minor Changes

- Add `meili`, the Meilisearch CLI: first version.
