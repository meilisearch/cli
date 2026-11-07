# ADR 0023: Text for humans in a terminal, JSON otherwise

Status: accepted. Date: 2026-11-07.

Supersedes one rule of ADR 0007, and of ADR 0002 before it: "every command writes JSON, in a terminal or not. There is no other format".

## Context

ADR 0002 chose JSON everywhere, terminal or not. Its reason: some sandboxes run the commands of an agent in a pseudo-terminal. If the format depends on how stdout is attached, the agent must guard against it on every call.

Humans use `meili` too. For them, indented JSON is readable but slow to scan. A list of projects is a dozen fields per project. A document list prints every attribute of every document. A write prints a task, and does not say that the documents are not changed yet. The human must know the API to read the output, and must guess the next command.

Alternatives considered:

- **Keep JSON everywhere.** Nothing changes for agents, and nothing improves for humans.
- **Text only with a flag, `--human`.** Agents keep their default. But a human must type the flag on every command, and few will discover it.
- **Comfort commands next to the API commands**, as ADR 0002 planned. Each one doubles a command. The human must learn two names for the same thing.

## Decision

- **When stdout is a terminal, `meili` prints text for a human. Otherwise, it prints compact JSON.** The data is the same. Only the format changes.
- **`--json` and `MEILI_JSON=1` force compact JSON**, in a terminal too. An agent that runs in a pseudo-terminal sets `MEILI_JSON=1` once.
- **`--no-color` and `NO_COLOR` remove the colors.** `NO_COLOR` is the variable that every CLI reads, so there is no `MEILI_NO_COLOR`.
- **The text has three parts.** A status sentence on stderr (`✓` done, `◐` in progress, `✗` failed). The data on stdout. The next step on stderr, with the exact command to run. stdout keeps carrying data only.
- **The text never hides data.** No value is cut. No relative date, pager, spinner or emoji. A list that shows only some fields says so, and says how to see everything.
- **Errors and warnings are text for a human too**: the message and the code, the hint, then the link.
- **Every command has a text, present and future.** By default, the text comes from the API response: a table for a list, every attribute for one item, the task for a write. A command may give its own text, with sentences about what it did and what to run next. The project and document commands do.
- **The text is not a contract.** It may change in any version. The JSON, the error shape, the exit codes and the command names stay the contract.
- **The help of every command shows the output flags first**, right after the usage.

## Consequences

- An agent in a pseudo-terminal must set `MEILI_JSON=1` or give `--json`. The docs and the help say so. This is the cost that ADR 0002 refused. We accept it, because the default of a terminal is a human.
- Compact JSON is the only JSON format. There is no indented JSON anymore.
- A new command has a text without any work. Its own text is optional.
- Each command with a text has snapshot tests of that text.
- Analytics do not change: `--json` and `--no-color` are flag names like the others.
