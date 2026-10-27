import { MeiliCliError } from "../../src/lib/errors.js";

/** The MeiliCliError `fn` throws; anything else fails the test. */
export function caught(fn: () => unknown): MeiliCliError {
  try {
    fn();
  } catch (error) {
    if (error instanceof MeiliCliError) return error;
    throw error;
  }
  throw new Error("expected a MeiliCliError");
}
