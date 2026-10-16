import {
  addDays,
  addMonths,
  assertDate,
  atDay,
  compare,
  daysBetween,
  isWithin,
  type LocalDate,
  maxDate,
  minDate,
  monthsBetween,
} from "./dates";
import { assertInteger, assertOneOf, show } from "./guards";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

const FREQUENCIES: readonly RecurrenceFrequency[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

/** Sanity bound; the database allows 1–12. */
export const MAX_RECURRENCE_INTERVAL = 1000;

export type Recurrence = {
  freq: RecurrenceFrequency;
  /** Every `interval` days/weeks/months/years (2 + weekly = quinzenal). */
  interval: number;
  start: LocalDate;
  /** Inclusive. */
  end?: LocalDate;
  /** Monthly and yearly only: day of the month (31 = last day). Defaults to the start day. */
  byMonthDay?: number;
};

function assertRecurrence(rule: Recurrence): void {
  if (typeof rule !== "object" || rule === null) {
    throw new RangeError(`rule must be a recurrence (received ${show(rule)})`);
  }
  assertOneOf(rule.freq, FREQUENCIES, "freq");
  assertInteger(rule.interval, "interval", 1, MAX_RECURRENCE_INTERVAL);
  assertDate(rule.start, "start");
  if (rule.end !== undefined) assertDate(rule.end, "end");
  if (rule.byMonthDay !== undefined) {
    assertInteger(rule.byMonthDay, "byMonthDay", 1, 31);
  }
}

/**
 * Occurrences of `rule` within [from, to], in increasing order (doc 03 §10.1).
 * Each date comes from the rule, not from the previous occurrence: "every 31st"
 * gives 28/fev and then 31/mar again, and 29/fev yearly gives 28/fev in common
 * years. Dates before `start` or after `end` are never produced.
 */
export function occurrencesBetween(
  rule: Recurrence,
  from: LocalDate,
  to: LocalDate,
): LocalDate[] {
  assertRecurrence(rule);
  const first = maxDate(rule.start, from);
  const last = rule.end ? minDate(rule.end, to) : to;
  const out: LocalDate[] = [];
  if (compare(first, last) > 0) return out;

  // Occurrence k is computed directly from the rule, so the loops only visit
  // the window, however long ago the rule started.
  if (rule.freq === "daily" || rule.freq === "weekly") {
    const step = (rule.freq === "daily" ? 1 : 7) * rule.interval;
    const firstK = Math.ceil(daysBetween(rule.start, first) / step);
    const lastK = Math.floor(daysBetween(rule.start, last) / step);
    for (let k = firstK; k <= lastK; k++) {
      out.push(addDays(rule.start, k * step));
    }
    return out;
  }

  const step = (rule.freq === "monthly" ? 1 : 12) * rule.interval;
  const day = rule.byMonthDay ?? rule.start.day;
  const firstK = Math.floor(monthsBetween(rule.start, first) / step);
  const lastK = Math.floor(monthsBetween(rule.start, last) / step);
  for (let k = firstK; k <= lastK; k++) {
    const month = addMonths(rule.start, k * step);
    const d = atDay(month.year, month.month, day);
    if (isWithin(d, first, last)) out.push(d);
  }
  return out;
}
