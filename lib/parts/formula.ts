/*
 * A paint tint formula, typed the way the can's label prints it:
 *
 *   CCE*COLORANT  OZ 32 64 128
 *   B1-Black       2  3  1  1
 *   Y3-Deep Gold   - 45  -  1
 *
 * One colorant per line, its amounts after it, separated by spaces; "-" for an
 * empty cell. An optional first line gives the column headings. Stored as that
 * text (so search and MCP see it as written) and shown as a table when it reads
 * cleanly; anything else is shown as typed.
 */

export type Formula = {
  headings: string[];
  rows: { colorant: string; amounts: string[] }[];
};

const AMOUNT = /^(\d+(?:[.,]\d+)?|[-–—])$/;
const HEADING = /^(oz|\d+\w*)$/i;

/** Split a line into its name and its trailing cells, which `cell` decides. */
function split(line: string, cell: RegExp): { name: string; cells: string[] } {
  const tokens = line.split(/\s+/);
  let i = tokens.length;
  while (i > 0 && cell.test(tokens[i - 1]!)) i--;
  return { name: tokens.slice(0, i).join(" "), cells: tokens.slice(i) };
}

/** The column headings a family can drop in from the form, as their labels print them. */
export const HEADING_PRESETS = [
  { label: "OZ 32 64 128 (Sherwin-Williams)", line: "COLORANT OZ 32 64 128" },
  { label: "OZ 48 96", line: "COLORANT OZ 48 96" },
];

function isHeading(line: string) {
  const { name, cells } = split(line.trim(), HEADING);
  return /colou?rant/i.test(name) || cells.some((c) => /^oz$/i.test(c));
}

/** Put `line` first, in place of a heading line already there. */
export function withHeadings(text: string, line: string): string {
  const lines = text.replace(/^\s*\n/, "").split("\n");
  if (lines[0]?.trim() && isHeading(lines[0])) lines.shift();
  const rest = lines.join("\n").trim();
  return rest ? `${line}\n${rest}` : `${line}\n`;
}

export function parseFormula(text: string): Formula | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  let headings: string[] = [];
  if (isHeading(lines[0]!)) {
    const first = split(lines[0]!, HEADING);
    headings = [first.name || "Colorant", ...first.cells];
    lines.shift();
  }

  const rows: Formula["rows"] = [];
  for (const line of lines) {
    const { name, cells } = split(line, AMOUNT);
    if (!name || cells.length === 0) return null;
    rows.push({
      colorant: name,
      amounts: cells.map((c) => (/^[-–—]$/.test(c) ? "" : c)),
    });
  }
  // One line with a number at the end is as likely a sentence ("order 0582820").
  if (rows.length === 0 || (headings.length === 0 && rows.length < 2))
    return null;

  const width = Math.max(
    headings.length - 1,
    ...rows.map((r) => r.amounts.length),
  );
  if (headings.length === 0) headings = ["Colorant"];
  while (headings.length < width + 1) headings.push("");
  for (const row of rows)
    while (row.amounts.length < width) row.amounts.push("");
  return { headings, rows };
}
