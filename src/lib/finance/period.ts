import {
  addDays,
  addMonths,
  assertDate,
  assertYearMonth,
  atDay,
  daysBetween,
  isWithin,
  type LocalDate,
  toYearMonth,
  type YearMonth,
} from "./dates";
import { assertInteger } from "./guards";

/**
 * Financial month. With start day `s`, the period labelled "outubro" runs from
 * `s`/out to the day before `s`/nov (5/out – 4/nov). With `s = 1` it is the
 * calendar month. In SQL: `date_trunc('month', occurred_on - (s - 1))`.
 */
export type Period = { start: LocalDate; end: LocalDate; label: YearMonth };

/** Start days stop at 28 so that every month has that day (doc 03 §10.2). */
export const MAX_PERIOD_START_DAY = 28;

function assertStartDay(startDay: number): void {
  assertInteger(startDay, "startDay", 1, MAX_PERIOD_START_DAY);
}

/** The period labelled `label`. Throws RangeError when `startDay` is outside 1–28. */
export function periodForMonth(label: YearMonth, startDay: number): Period {
  assertYearMonth(label, "label");
  assertStartDay(startDay);
  const next = addMonths(label, 1);
  return {
    start: atDay(label.year, label.month, startDay),
    end: addDays(atDay(next.year, next.month, startDay), -1),
    label: { year: label.year, month: label.month },
  };
}

/** The period that contains `date`. Throws RangeError when `startDay` is outside 1–28. */
export function periodContaining(date: LocalDate, startDay: number): Period {
  assertDate(date);
  assertStartDay(startDay);
  const label = date.day >= startDay ? toYearMonth(date) : addMonths(date, -1);
  return periodForMonth(label, startDay);
}

/** The period `count` months after (or before, when negative) `period`. */
export function shiftPeriod(period: Period, count: number): Period {
  // start.day is the start day itself: it is at most 28, so it is never clamped.
  return periodForMonth(addMonths(period.label, count), period.start.day);
}

/** Number of days in a period, both ends included. */
export function periodDays(period: { start: LocalDate; end: LocalDate }) {
  return daysBetween(period.start, period.end) + 1;
}

export function isInPeriod(
  date: LocalDate,
  period: { start: LocalDate; end: LocalDate },
): boolean {
  return isWithin(date, period.start, period.end);
}
