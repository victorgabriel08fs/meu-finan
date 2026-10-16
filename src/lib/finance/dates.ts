import { TZDate } from "@date-fns/tz";
import { assertInteger, show } from "./guards";

/** Calendar date with no time and no time zone. `month` is 1–12. */
export type LocalDate = { year: number; month: number; day: number };

/** Calendar month. `month` is 1–12. */
export type YearMonth = { year: number; month: number };

/** Default for `user_settings.timezone`. */
export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

/** Four-digit years only, so every date has a `YYYY-MM-DD` form. */
export const MIN_YEAR = 1000;
export const MAX_YEAR = 9999;

const MS_PER_DAY = 86_400_000;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

const isYear = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= MIN_YEAR &&
  (value as number) <= MAX_YEAR;

const isMonth = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 12;

const leap = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const monthLength = (year: number, month: number) =>
  month === 2 && leap(year) ? 29 : MONTH_LENGTHS[month - 1];

const pad = (value: number, size: number) => String(value).padStart(size, "0");

const toUTC = (d: LocalDate) => Date.UTC(d.year, d.month - 1, d.day);

const fromUTC = (ms: number): LocalDate => {
  const t = new Date(ms);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
  };
};

export function isValidYearMonth(value: unknown): value is YearMonth {
  if (typeof value !== "object" || value === null) return false;
  const { year, month } = value as Record<string, unknown>;
  return isYear(year) && isMonth(month);
}

export function isValidDate(value: unknown): value is LocalDate {
  if (!isValidYearMonth(value)) return false;
  const { day } = value as Record<string, unknown>;
  return (
    Number.isInteger(day) &&
    (day as number) >= 1 &&
    (day as number) <= monthLength(value.year, value.month)
  );
}

export function assertYearMonth(value: YearMonth, label = "month"): void {
  if (!isValidYearMonth(value)) {
    throw new RangeError(
      `${label} must be a valid { year, month } (received ${show(value)})`,
    );
  }
}

export function assertDate(value: LocalDate, label = "date"): void {
  if (!isValidDate(value)) {
    throw new RangeError(
      `${label} must be a valid calendar date (received ${show(value)})`,
    );
  }
}

export function isLeapYear(year: number): boolean {
  assertInteger(year, "year", MIN_YEAR, MAX_YEAR);
  return leap(year);
}

export function daysInMonth(year: number, month: number): number {
  assertYearMonth({ year, month });
  return monthLength(year, month);
}

/** Day `day` (1–31) of the month, clamped to the month length (31 → 30/29/28). */
export function atDay(year: number, month: number, day: number): LocalDate {
  assertYearMonth({ year, month });
  assertInteger(day, "day", 1, 31);
  return { year, month, day: Math.min(day, monthLength(year, month)) };
}

/** Accepts a LocalDate too; the day is dropped. */
export function addMonths(value: YearMonth, count: number): YearMonth {
  assertYearMonth(value);
  assertInteger(count, "count");
  const index = value.year * 12 + (value.month - 1) + count;
  const result = { year: Math.floor(index / 12), month: (index % 12) + 1 };
  assertYearMonth(result, "resulting month");
  return result;
}

/** Same day `count` months later, clamped to the month length (31/jan → 28/fev). */
export function addMonthsToDate(date: LocalDate, count: number): LocalDate {
  assertDate(date);
  const target = addMonths(date, count);
  return atDay(target.year, target.month, date.day);
}

export function addDays(date: LocalDate, count: number): LocalDate {
  assertDate(date);
  assertInteger(count, "count");
  const result = fromUTC(toUTC(date) + count * MS_PER_DAY);
  assertDate(result, "resulting date");
  return result;
}

export function compare(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  assertDate(a);
  assertDate(b);
  const x = a.year * 10_000 + a.month * 100 + a.day;
  const y = b.year * 10_000 + b.month * 100 + b.day;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  assertDate(a);
  assertDate(b);
  return Math.round((toUTC(b) - toUTC(a)) / MS_PER_DAY);
}

export function compareMonths(a: YearMonth, b: YearMonth): -1 | 0 | 1 {
  const diff = monthsBetween(b, a);
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

/** Whole months from `a` to `b`, ignoring days (negative when `b` is earlier). */
export function monthsBetween(a: YearMonth, b: YearMonth): number {
  assertYearMonth(a);
  assertYearMonth(b);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** Inclusive on both ends. */
export function isWithin(date: LocalDate, from: LocalDate, to: LocalDate) {
  return compare(from, date) <= 0 && compare(date, to) <= 0;
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return compare(a, b) <= 0 ? a : b;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return compare(a, b) >= 0 ? a : b;
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: LocalDate): number {
  assertDate(date);
  return new Date(toUTC(date)).getUTCDay();
}

export function toYearMonth(date: LocalDate): YearMonth {
  assertDate(date);
  return { year: date.year, month: date.month };
}

export function monthStart(month: YearMonth): LocalDate {
  assertYearMonth(month);
  return { year: month.year, month: month.month, day: 1 };
}

export function monthEnd(month: YearMonth): LocalDate {
  assertYearMonth(month);
  return {
    year: month.year,
    month: month.month,
    day: monthLength(month.year, month.month),
  };
}

/** `YYYY-MM-DD`, the format of Postgres `date` columns. */
export function iso(date: LocalDate): string {
  assertDate(date);
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

/** Strict `YYYY-MM-DD` parser; throws RangeError for anything else (e.g. 2026-02-30). */
export function parse(value: string): LocalDate {
  const match = typeof value === "string" ? ISO_DATE.exec(value) : null;
  const date = match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : null;
  if (!date || !isValidDate(date)) {
    throw new RangeError(
      `Expected a YYYY-MM-DD date (received ${show(value)})`,
    );
  }
  return date;
}

/** `YYYY-MM`. */
export function isoMonth(month: YearMonth): string {
  assertYearMonth(month);
  return `${pad(month.year, 4)}-${pad(month.month, 2)}`;
}

/** Strict `YYYY-MM` parser; throws RangeError for anything else. */
export function parseMonth(value: string): YearMonth {
  const match = typeof value === "string" ? ISO_MONTH.exec(value) : null;
  const month = match
    ? { year: Number(match[1]), month: Number(match[2]) }
    : null;
  if (!month || !isValidYearMonth(month)) {
    throw new RangeError(`Expected a YYYY-MM month (received ${show(value)})`);
  }
  return month;
}

/**
 * Calendar date of an instant in an IANA time zone (or a UTC offset such as
 * "-03:00"). Pure: the caller reads the clock at the edge (see
 * `todayInTimeZone` in `@/lib/format/date`) and passes the instant here.
 */
export function localDateIn(
  instant: Date | number,
  timeZone: string,
): LocalDate {
  const ms = instant instanceof Date ? instant.getTime() : instant;
  const zoned = new TZDate(ms, timeZone);
  const date = {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
  };
  if (!isValidDate(date)) {
    throw new RangeError(
      `Invalid instant or time zone (instant ${show(ms)}, time zone ${show(timeZone)})`,
    );
  }
  return date;
}
