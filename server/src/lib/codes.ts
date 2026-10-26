import { randomInt } from "node:crypto";

/**
 * Next human-readable code in a series, e.g. ["AUTH001","AUTH010"] → "AUTH011".
 * Codes are also unique in the database, so a concurrent duplicate fails with a
 * 409 instead of silently colliding.
 */
export function nextCode(prefix: string, existing: string[], width = 3) {
  const max = existing.reduce((m, code) => {
    const n = Number(code.slice(prefix.length));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

/** A readable one-time password (no ambiguous characters), always with letters and digits. */
export function temporaryPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (set: string, n: number) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
  return `${pick(letters, 4)}-${pick(digits, 4)}-${pick(letters, 2)}`;
}
