/**
 * Minimal RFC 4180 CSV writer. Cells that a spreadsheet would treat as a
 * formula (=, +, -, @) are prefixed with an apostrophe to block CSV injection
 * from user-written text such as ticket subjects.
 */
export type Cell = string | number | boolean | null | undefined;

const escape = (value: Cell) => {
  if (value == null) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(header: string[], rows: Cell[][]) {
  // BOM so Excel opens UTF-8 (₹, names) correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(escape).join(",")).join("\r\n") + "\r\n";
}
