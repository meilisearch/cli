---
"@meilisearch/cli": minor
---

**Breaking:** Change the output in a terminal: text for humans, and compact JSON with `--json` or `MEILI_JSON=1`. Piped output stays compact JSON. An agent that runs in a terminal sets `MEILI_JSON=1`. ([#82](https://github.com/meilisearch/cli/pull/82))
