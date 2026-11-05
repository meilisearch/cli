---
"@meilisearch/cli": minor
---

Usage analytics (ADR 0019): a command that does not exist sends `cli_command_not_found`, with the command that the hint suggests, never what was typed. `meili auth status` links a session to its Meilisearch Cloud user when `auth login` did not. A session of another Cloud is never linked.
