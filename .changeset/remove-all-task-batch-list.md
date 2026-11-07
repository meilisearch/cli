---
"@meilisearch/cli": minor
---

**Breaking:** Remove `--all` from `meili task list` and `meili batch list`: an instance can hold millions of tasks. Page with `--limit` and `--from` instead: pass the `next` of each response as the `--from` of the next call, and stop when `next` is `null`. ([#87](https://github.com/meilisearch/cli/pull/87))
