---
"@meilisearch/cli": minor
---

**Breaking change: `--output` (`-o`) and `MEILI_OUTPUT` are removed, and so is the `ndjson` mode.** Every command prints JSON, indented in a terminal and compact when piped, as `--output json` did. `--all` prints every page as one list.
