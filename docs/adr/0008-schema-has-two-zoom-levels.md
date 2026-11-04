# ADR 0008: `meili schema` has two zoom levels

Status: accepted. Date: 2026-10-15.

## Context

ADR 0002 made `meili schema` the way an agent learns the CLI. It prints every command as JSON, with its flags, its description and its examples. It is generated from the oclif manifest, so it is always in sync with the code. `commands.md` says it in one sentence: "This is how an agent learns the CLI in one call."

That promise holds with six commands. It breaks silently as the CLI grows. Measured on this repository, six commands weigh 7.6 kB. `pnpm api:coverage` derives 37 Meilisearch commands and 22 Management commands. With the four commands without an API, that gives about sixty-three. The same output at that size is 100 to 150 kB, or 25,000 to 40,000 tokens. The agent spends them before it reads a single route. An agent that only wants to know whether `meili get stats` exists pays for every flag of `meili search` and of `meili update settings`.

Most of that weight is repetition, not information. The five global flags are serialized on every command. That is 909 bytes each time, about 57 kB at sixty-three commands. It is more than everything else put together, for five flags that the agent needs once.

The output also lacks what an agent asks first. The code already declares the routes a command covers, in `static routes`, and the manifest already carries them. But `schema` does not print them, so the agent cannot connect the command to the API documentation it already knows. The agent also cannot tell whether a command returns a task, or which key action a 403 is about. Both could be derived.

## Decision

`meili schema` keeps its name and gets a second zoom level, selected by a flag. There is no third level and no full dump. The two levels cover every need, and `oclif.manifest.json` is still there for anyone who wants everything.

- `meili schema` prints the index: the global flags once, then one entry per command with its `id`, its `description` and its `routes`. The description is only its first paragraph. `config set` and `config unset` carry a warning paragraph that is 17 % of today's index, and it belongs in the detail. The index is about 12 kB at sixty-three commands.
- `meili schema --command "get indexes"` prints one command in full: `id`, `description`, `api`, `routes`, `async`, `keyActions`, the `flags` the command declares itself and its `examples`.
- An unknown `--command` is a usage error, `cli_usage`, exit 2. Its hint names the closest command, the same suggestion that `errors.ts` already computes for an unknown command. When no command is close, the hint names `meili schema`.
- A field that would say nothing is absent, rather than empty or false. `routes` and `keyActions` already follow this convention. So there is no `async` on a command that returns no task, and no `required` on an optional flag. That is 7.6 % of a detail call.

"The flags the command declares itself" are read from the command class, where oclif keeps `flags` and `baseFlags` apart. They are not inferred from the manifest, which merges the two. The difference matters because `meili config set` redefines `--project` and `--project-url` as required, with its own descriptions. Dropping global flags by name would hide exactly the two flags that this command needs. Comparing the rendered flag against `BaseCommand.baseFlags` would work today. But it compares two things built separately: the live `src` object and the manifest built from `dist`. With an outdated manifest, every unchanged global flag would look redefined. The class answers the question directly.

Three fields are new. None of them is metadata to maintain twice by hand:

- `routes`, already declared by `static routes` and checked against the OpenAPI document by `test/contract/api.test.ts`.
- `async`, derived from the presence of the `--wait` flag. A command that polls a task is a command that returns one.
- `keyActions`, the Meilisearch key actions that a route requires. The document declares them on all 143 of its operations. For example, `GET /indexes` carries `["indexes.get", "indexes.*", "*"]`. The command declares the specific one in `static keyActions`, the same way it declares its routes, with the same contract test against the document. The Management API document declares no key action, so the field is absent there. It is also absent on `GET /health`, which needs no key at all.

Note one difference between the two declared fields. `routes` is an input: nothing can compute it. `keyActions` is a pure function of `routes` and the document, so the hand-written value is a copy that the contract test pins. One static line next to `routes`, filled at the same time by the `add-command` skill, has fewer moving parts than a generation step in `pnpm gen:manifest`. That step would silently emit `[]` whenever `openapi/` is absent. A second field derived from `routes` is the signal to generate instead of declare. At sixty-three commands, copying two derived values by hand for each command is no longer the cheaper option.

Two fields were considered and rejected. `destructive` repeats the verb already present in the id, and the `--yes` already listed as a required flag. `supports_dry_run` was rejected because dry runs are out of scope, and a field that is always `false` has a cost on every command.

The two levels are one command and one flag, not two commands. `meili commands` and `meili describe <command>` would add a second and a third entry point for discovery, next to `--help`. And `describe <command>` would take a positional argument, which the grammar of `commands.md` forbids.

## Consequences

- An agent's first call drops from about 40,000 tokens to about 3,000. The agent pays for a command's flags only when it uses that command.
- `routes` in the index often makes the second call unnecessary: an agent that knows the Meilisearch API reads `GET /indexes` and needs nothing more.
- Every API command now declares `static keyActions` next to `static routes`. The contract test fails when the value drifts from the document. The `add-command` skill includes the step.
- This changes the shape of `schema`'s output, so it is a breaking change. It ships before 1.0, where a breaking change is a minor version. It costs nothing now, and later it would cost a major version.
- `meili schema` is still generated from the manifest, and still cannot drift from the code. The snapshot in `test/contract/` covers the index and every command in full. A renamed flag is as visible in review as before.
- The detail loads the command class, so it needs `dist`. The published package ships `dist`, and `pnpm test` builds it first. The index still reads only the manifest: the call that an agent makes in every session loads nothing.
