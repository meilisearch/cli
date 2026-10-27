/**
 * The conversions rule 7 of docs/contract/commands.md asks of a flag before it
 * can become a body field: the text of a number, the JSON text of an object,
 * the comma-separated text of an array of scalars, and `null`, which sends a
 * JSON null. Text that does not convert is sent as it is, so that the API
 * names the value it refused, with its own code, rather than the CLI judging a
 * value the API owns. The CLI only refuses what it cannot send at all, as
 * `--data` and `--file`, which it has to parse before it can merge them.
 */

/** The text that sends a JSON null: `--stop-words null` resets that setting. */
const NULL = "null";

/** An object or a nested array, as JSON text: `--typo-tolerance '{"enabled":false}'`. */
export function asJson(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** A number: `--search-cutoff-ms 1500`. */
export function asNumber(value: string | undefined): number | string | null | undefined {
  if (value === undefined) return undefined;
  if (value === NULL) return null;
  const text = value.trim();
  // `Number` alone would not do: it reads `0x1` as 1 and `1e999` as Infinity,
  // which JSON writes as null. Both turn what the agent typed into another
  // value, silently. Only text that spells a decimal number becomes one.
  return DECIMAL.test(text) && Number.isFinite(Number(text)) ? Number(text) : value;
}

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** An array of scalars, comma-separated: `--stop-words the,a`. */
export function asList(value: string | undefined): string[] | null | undefined {
  if (value === undefined) return undefined;
  return value === NULL ? null : value.split(",");
}

/** A string, passed as it is: `--distinct-attribute sku`. */
export function asText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === NULL ? null : value;
}
