/**
 * Dates from statements: day/month/year (the Brazilian default), ISO
 * year-month-day and the US month/day/year, with any time part ignored.
 */

/** dmy: 14/10/2026, 14-10-26, 14 out 2026 · ymd: 2026-10-14, 20261014 · mdy: 10/14/2026. */
export type DateFormat = "dmy" | "ymd" | "mdy";

export const DATE_FORMATS: readonly DateFormat[] = ["dmy", "ymd", "mdy"];

/** Month names and abbreviations in Portuguese and English, by their first 3 letters. */
const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  fev: 2,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  mai: 5,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  set: 9,
  sep: 9,
  out: 10,
  oct: 10,
  nov: 11,
  dez: 12,
  dec: 12,
};

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const pad = (value: number, size = 2) => String(value).padStart(size, "0");

/** ISO `YYYY-MM-DD` when the parts make a real calendar date, else null. */
export function isoDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const length = month === 2 && leap ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
  if (!Number.isInteger(day) || day < 1 || day > length) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** `YYYY-MM-DD` plus `days` (may be negative). */
export function addDaysIso(date: string, days: number): string {
  const ms = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)) + days,
  );
  return new Date(ms).toISOString().slice(0, 10);
}

/** "26" → 2026, "89" → 1989; four digits pass through. */
function fullYear(text: string): number {
  const value = Number(text);
  if (text.length !== 2) return value;
  return value < 70 ? 2000 + value : 1900 + value;
}

function monthNumber(text: string): number | null {
  if (/^\d{1,2}$/.test(text)) return Number(text);
  const key = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .slice(0, 3);
  return MONTH_NAMES[key] ?? null;
}

// The date may be followed by a time ("14/10/2026 10:32", "2026-10-14T10:32:00Z").
const END = "(?:$|[T\\s,])";
const YMD = new RegExp(`^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})${END}`);
const YMD_COMPACT = /^(\d{4})(\d{2})(\d{2})(?:$|[T\s]|\d{6})/;
const DMY = new RegExp(
  `^(\\d{1,2})(?:[-/.]|\\s+)(\\d{1,2}|\\p{L}{3,9})\\.?(?:[-/.]|\\s+)(\\d{4}|\\d{2})${END}`,
  "u",
);
const DMY_LONG = new RegExp(
  `^(\\d{1,2})\\s+de\\s+(\\p{L}{3,9})\\s+de\\s+(\\d{4})${END}`,
  "u",
);
const MDY = new RegExp(`^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4}|\\d{2})${END}`);

/** The ISO date of a cell in the given format, or null. */
export function parseDate(raw: string, format: DateFormat): string | null {
  const text = raw.trim();
  if (text === "") return null;
  if (format === "ymd") {
    const match = YMD.exec(text) ?? YMD_COMPACT.exec(text);
    if (!match) return null;
    return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  if (format === "mdy") {
    const match = MDY.exec(text);
    if (!match) return null;
    return isoDate(
      fullYear(match[3] ?? ""),
      Number(match[1]),
      Number(match[2]),
    );
  }
  const match = DMY.exec(text) ?? DMY_LONG.exec(text);
  if (!match) return null;
  const month = monthNumber(match[2] ?? "");
  if (month === null) return null;
  return isoDate(fullYear(match[3] ?? ""), month, Number(match[1]));
}

/**
 * The format that reads the column. Picks the one that parses the most cells
 * (at least 80% of the non-empty ones); between day/month and month/day, a
 * first number above 12 settles it, and day/month wins a tie (pt-BR). Null
 * when no format fits.
 */
export function detectDateFormat(values: readonly string[]): DateFormat | null {
  const cells = values.map((value) => value.trim()).filter(Boolean);
  if (cells.length === 0) return null;
  let best: DateFormat | null = null;
  let bestCount = 0;
  for (const format of DATE_FORMATS) {
    const count = cells.filter(
      (cell) => parseDate(cell, format) !== null,
    ).length;
    // Strictly more: the order of DATE_FORMATS breaks ties (dmy first).
    if (count > bestCount) {
      best = format;
      bestCount = count;
    }
  }
  return best !== null && bestCount >= cells.length * 0.8 ? best : null;
}
