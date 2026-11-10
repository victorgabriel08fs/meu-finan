import {
  addDays,
  assertDate,
  compare,
  daysBetween,
  type LocalDate,
} from "./dates";
import { spendablePerDay } from "./forecast";
import { assertInteger } from "./guards";
import { assertCents } from "./money";

export type SpendableByDayInput = {
  /** The cash flow's days (`projectedCents`: end-of-day "saldo previsto", null before today). */
  days: readonly { date: LocalDate; projectedCents: number | null }[];
  today: LocalDate;
  /** Last day counted: the end of the financial month. */
  until: LocalDate;
  /** The month's budget still available (`pace.availableCents`); null without a budget. */
  budgetAvailableCents?: number | null;
  /** Most rows to return. Default 14. */
  maxDays?: number;
};

export type SpendableDay = {
  date: LocalDate;
  /** Days left from this one to `until`, both counted. */
  daysLeft: number;
  /** The lowest forecast balance from this day to `until`. */
  balanceCents: number;
  perDayCents: number;
  /** The budget's share of the day is below what the balance alone would allow. */
  cappedByBudget: boolean;
};

export type SpendableByDay = {
  rows: SpendableDay[];
  /** How far under zero the forecast goes up to `until` (0 when it does not). */
  shortfallCents: number;
};

export const SPENDABLE_BY_DAY_MAX_DAYS = 14;

/**
 * "Quanto dá para gastar por dia" for each of the next days (doc 03 §12): the
 * lowest forecast balance from that day to `until` (a bill due on the 25th
 * lowers every day before it) spread over the days left, both ends counted,
 * and never above the budget's available amount spread the same way. Days
 * before today or after `until` are ignored; one row per day from today,
 * at most `maxDays` and never past `until`.
 */
export function spendablePerDayByDay(
  input: SpendableByDayInput,
): SpendableByDay {
  const {
    days,
    today,
    until,
    budgetAvailableCents = null,
    maxDays = SPENDABLE_BY_DAY_MAX_DAYS,
  } = input;
  assertDate(today, "today");
  assertDate(until, "until");
  assertInteger(maxDays, "maxDays", 0);
  if (budgetAvailableCents !== null) {
    assertCents(budgetAvailableCents, "budgetAvailableCents");
  }
  if (compare(until, today) < 0) {
    throw new RangeError("until must not be before today");
  }

  const length = daysBetween(today, until) + 1;
  // Forecast by offset from today (null where the day is missing).
  const projected: (number | null)[] = new Array(length).fill(null);
  for (const day of days) {
    assertDate(day.date, "days.date");
    if (day.projectedCents === null) continue;
    assertCents(day.projectedCents, "days.projectedCents");
    const offset = daysBetween(today, day.date);
    if (offset >= 0 && offset < length) projected[offset] = day.projectedCents;
  }

  // Lowest balance from each day to the end, back to front.
  const lowest: (number | null)[] = new Array(length).fill(null);
  let running: number | null = null;
  for (let offset = length - 1; offset >= 0; offset--) {
    const value = projected[offset] ?? null;
    if (value !== null && (running === null || value < running)) {
      running = value;
    }
    lowest[offset] = running;
  }

  const rows: SpendableDay[] = [];
  for (let offset = 0; offset < Math.min(length, maxDays); offset++) {
    const balanceCents = lowest[offset];
    if (balanceCents === null) continue;
    const daysLeft = length - offset;
    const fromBalance = spendablePerDay(balanceCents, daysLeft);
    const cap =
      budgetAvailableCents === null
        ? null
        : Math.max(0, Math.floor(budgetAvailableCents / daysLeft));
    rows.push({
      date: addDays(today, offset),
      daysLeft,
      balanceCents,
      perDayCents: spendablePerDay(balanceCents, daysLeft, cap),
      cappedByBudget: cap !== null && cap < fromBalance,
    });
  }

  const overall = lowest[0] ?? 0;
  return { rows, shortfallCents: Math.max(0, -overall) };
}
