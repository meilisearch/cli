# ADR 0008: `meili schema` has two zoom levels

Status: accepted. Date: 2026-10-15.

## Context

ADR 0002 made `meili schema` the way an agent learns the CLI: every command, with its flags, its description and its examples, as JSON, generated from the oclif manifest, always in sync with the code. `commands.md` says it in one sentence: "This is how an agent learns the CLI in one call."

That promise holds at six commands and breaks silently as the CLI grows. Measured on this repository: six commands weigh 7.6 kB. `pnpm api:coverage` derives 37 Meilisearch commands and 22 Management commands, which with the four commands without an API gives about sixty-three. The same shape at that size is 100 to 150 kB, 25,000 to 40,000 tokens, spent before the agent has read a single route. An agent that wants to know whether `meili get stats` exists pays for every flag of `meili search` and of `meili update settings`.

Most of that weight is duplication, not information. The five global flags are serialized on every command: 909 bytes each time, about 57 kB at sixty-three commands, more than everything else put together, for five flags the agent needs once.

The output is also missing what an agent asks first. The routes a command covers are already declared in the code, `static routes`, and the manifest already carries them, but `schema` does not print them: the agent cannot connect the command to the API documentation it already knows. Neither can it tell whether a command returns a task, nor which key action a 403 is complaining about, although both are derivable.

## Decision

`meili schema` keeps its name and gains a second zoom level, selected by a flag. There is no third level and no full dump: the two levels cover every need, and `oclif.manifest.json` is still there for whoever wants everything.

- `meili schema` prints the index: the global flags once, then one entry per command with its `id`, its `description` and its `routes`. About 12 kB at sixty-three commands.
- `meili schema --command "get indexes"` prints one command in full: `id`, `description`, `api`, `routes`, `async`, `keyActions`, its own `flags` and its `examples`. The global flags are not repeated: they belong to the index. A global flag a command redefines keeps its place, `meili config add --project`, required and with its own description: what is dropped is only a flag the index already prints identically.
- An unknown `--command` is a usage error, `cli_usage`, exit 2, with a hint that names `meili schema`.

Three fields are new, and none of them is metadata to maintain by hand twice:

- `routes`, already declared by `static routes` and checked against the OpenAPI document by `test/contract/api.test.ts`.
- `async`, derived from the presence of the `--wait` flag. A command that polls a task is a command that returns one.
- `keyActions`, the Meilisearch key actions a route requires. The document declares them on all 143 of its operations, `GET /indexes` carries `["indexes.get", "indexes.*", "*"]`, and the command declares the specific one, `static keyActions`, the same way it declares its routes, with the same contract test against the document. The Management API declares no scope on its personal access token, so the field is absent there, as it is on `GET /health`, which needs no key at all.

Two fields that were considered and rejected: `destructive`, which repeats the verb already present in the id and the `--yes` already listed as a required flag, and `supports_dry_run`, since dry runs are out of scope and a field that is always `false` is paid for on every command.

The two levels are one command and one flag, not two commands: `meili commands` and `meili describe <command>` would add a second and a third entry point to discovery, next to `--help`, and `describe <command>` would take a positional argument, which the grammar of `commands.md` forbids.

## Consequences

- An agent's first call drops from about 40,000 tokens to about 3,000, and it pays for a command's flags only when it uses that command.
- `routes` in the index often makes the second call unnecessary: an agent that knows the Meilisearch API reads `GET /indexes` and needs nothing more.
- Every API command now declares `static keyActions` next to `static routes`. The contract test fails when it drifts from the document, and the `add-command` skill has the step.
- This changes the shape of `schema`'s output, which is a breaking change. It ships before 1.0, where a breaking change is a minor version, so it costs nothing now and would cost a major later.
- `meili schema` is still generated from the manifest and still cannot drift from the code: the snapshot in `test/contract/` shows every change in review.
