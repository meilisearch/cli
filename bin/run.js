#!/usr/bin/env node
import { flush, run } from "@oclif/core";
import { handleFatalError } from "../dist/lib/errors.js";

// oclif's own `execute()` prints errors as text. Errors here must follow
// docs/contract/output.md, so the last-resort handler is ours.
const argv = process.argv.slice(2);
try {
  await run(argv, import.meta.url);
  await flush();
} catch (error) {
  handleFatalError(error, argv);
}
