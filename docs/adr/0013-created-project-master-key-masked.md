# ADR 0013: The master key of a created project is masked on stdout

Status: accepted. Date: 2026-11-04. Supersedes one point of ADR 0007: API responses pass through unchanged, except the `masterKey` that `add projects` prints.

## Context

`POST /api/v2/projects` returns the new project with its `masterKey`, the key that can do everything on that project. `meili add projects` printed it on stdout unchanged, as `output.md` and `config.md` asked: a credential an API returns is data, and the CLI hides nothing from the agent it works for.

A command that prints a key is fine when the key is what it was run for. `get keys` prints keys, and a command on `GET /api/v2/projects/{projectId}/master-key` would print the master key: whoever runs them expects a secret in the answer and handles the output accordingly. `add projects` is run to create a project. Nobody expects the strongest key of that project to pop up at the end of its output, so nobody takes care of where that output goes.

And an agent's stdout is not a private channel. It lands in the agent's transcript, in CI logs, in the history of a chat, wherever the output of a command is kept. A master key printed there by surprise is a master key copied to every one of those places, when the agent needs the key to reach the project, not to read it.

The CLI already has two ways to put the key where it belongs, the config file, without printing it:

- `add projects --sync-config` writes the project's entry with its master key as `apiKey`.
- `config sync-with-cloud` reads the key with `GET /api/v2/projects/{projectId}/master-key` and writes it into an entry without a key, for a project created earlier or elsewhere.

Alternatives considered:

- **Keep printing the key.** Faithful to the API, but every creation leaks the strongest key of the project into logs, for a use the config file already covers.
- **Drop the field.** The output no longer says a key exists, and an agent cannot tell a key that was masked from a response that had none.
- **A flag that prints the key in full**, `--show-secrets`. Not now: no use needs it that the config file does not cover, and a flag that unmasks is one an agent adds by reflex. It can come later, in its own decision, if a use shows up.
- **Mask every credential an API returns**, the `key` of `get keys` too. Those commands are run for the key: printing it is their purpose, not a surprise. Not this decision.

## Decision

- **`add projects` prints the `masterKey` masked**, `****` followed by its last four characters, the way `config list` masks a key. The other fields pass through unchanged.
- **`--sync-config` is the recommended way to keep the key**: the description of `add projects` says so. When the project has no URL yet, the error points to `config sync-with-cloud --project-name <name>`, which adds the project with its master key once it has one.

## Consequences

- An agent that creates a project with `--sync-config` reaches it with `--project <name>` and never sees its key.
- An agent that created a project without `--sync-config` gets its key into the config file with `config sync-with-cloud`, if its token owns the project's team.
- `output.md`, "Pass-through", and `config.md`, "Secrets", carry the exception. Rule 8 of `CLAUDE.md` says it too.
