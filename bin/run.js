#!/usr/bin/env node
import { Config, flush, run, toConfiguredId } from "@oclif/core";
import { handleFatalError } from "../dist/lib/errors.js";

// oclif's own `execute()` prints errors as text. Errors here must follow
// docs/contract/output.md, so the last-resort handler is ours.
const argv = process.argv.slice(2);
const config = await Config.load(import.meta.url);
try {
  await run(argv, config);
  await flush();
} catch (error) {
  const commandIds = config.commandIDs.map((id) => toConfiguredId(id, config));
  handleFatalError(error, argv, commandIds);
}
