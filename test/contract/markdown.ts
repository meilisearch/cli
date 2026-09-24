/** Small helpers to read the Markdown tables of docs/contract/. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "../helpers/run-command.js";

export function readDoc(relativePath: string): string {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf8");
}

/** Every body row of every Markdown table, as trimmed cells. Header and separator rows are dropped. */
export function tableRows(markdown: string): string[][] {
  const rows: string[][] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .slice(1, line.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
      // The separator row follows the header row: drop the header.
      rows.pop();
      continue;
    }
    rows.push(cells);
  }
  return rows;
}

/** The text of the section that starts with `## <title>`, up to the next `## ` heading. */
export function section(markdown: string, title: string): string {
  const lines = markdown.split("\n");
  const start = lines.indexOf(`## ${title}`);
  if (start === -1) throw new Error(`section "${title}" not found`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith("## ")) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** All `code spans` of a text. Fenced code blocks are dropped first: their backticks would pair with inline ones. */
export function codeSpans(text: string): string[] {
  const withoutBlocks = text.replace(/```[\s\S]*?```/g, "");
  return [...withoutBlocks.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
}
