---
"@meilisearch/cli": minor
---

**Breaking:** Remove `--all` from `meili document list`: an index can hold millions of documents. Page with `--limit` and `--offset` instead. ([#81](https://github.com/meilisearch/cli/pull/81))
