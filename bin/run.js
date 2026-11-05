#!/usr/bin/env node
import { Config, flush, run, toConfiguredId } from "@oclif/core";
import { sendAnalytics, track } from "../dist/lib/analytics.js";
import { handleFatalError, unknownCommand } from "../dist/lib/errors.js";

// oclif's own `execute()` prints errors as text. Errors here must follow
// docs/contract/output.md, so the last-resort handler is ours.
const argv = process.argv.slice(2);
// oclif answers `--version` with its own text. ADR 0021 wants the JSON of `version`.
if (argv[0] === "--version") argv[0] = "version";
const config = await Config.load(import.meta.url);
try {
  await run(argv, config);
  await flush();
} catch (error) {
  const commandIds = config.commandIDs.map((id) => toConfiguredId(id, config));
  handleFatalError(error, argv, commandIds);
  const unknown = unknownCommand(error, commandIds, argv);
  if (unknown !== undefined) track("cli_command_not_found", unknown);
}
// A help or an unknown command runs no command, so no `BaseCommand` sent its event.
await sendAnalytics(process.env, { cli_version: config.version });
