---
"@meilisearch/cli": minor
---

**Breaking:** Remove `--all` from `meili task list` and `meili batch list`: an instance can hold millions of tasks. Page with `--limit` and `--from` instead. ([#87](https://github.com/meilisearch/cli/pull/87))
