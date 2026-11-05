// When each notice goes out and what it covers (doc 01 §9, step
// sendReminders). Dates are the person's local dates; pure, no clock.
import {
  addDays,
  dayOfWeek,
  daysBetween,
  iso,
  type LocalDate,
  type Period,
  parse,
  periodContaining,
  shiftPeriod,
} from "@/lib/finance";

/** The weekly summary goes out on Mondays, about the week before. */
export function isWeeklySummaryDay(today: LocalDate): boolean {
  return dayOfWeek(today) === 1;
}

/** The seven days before today: Monday to Sunday when today is a Monday. */
export function previousWeek(today: LocalDate): { start: string; end: string } {
  return { start: iso(addDays(today, -7)), end: iso(addDays(today, -1)) };
}

/** The monthly summary goes out on the first day of a financial month. */
export function isMonthlySummaryDay(
  today: LocalDate,
  monthStartDay: number,
): boolean {
  return iso(periodContaining(today, monthStartDay).start) === iso(today);
}

/** The financial month before the one containing today. */
export function closedPeriod(today: LocalDate, monthStartDay: number): Period {
  return shiftPeriod(periodContaining(today, monthStartDay), -1);
}

/** Bills still unpaid up to this many days after the due date get a last notice. */
export const OVERDUE_WINDOW_DAYS = 7;

/** How long the keys of the bills already notified are remembered. */
export const NOTIFIED_BILLS_LOOKBACK_DAYS = 14;

const OVERDUE_SUFFIX = ":vencida";

export type BillCandidate = {
  id: string;
  type: "transaction" | "invoice";
  /** YYYY-MM-DD */
  dueOn: string;
};

export type BillReminder<T extends BillCandidate> = {
  item: T;
  /** Stored with the notice, so the same bill is not announced twice. */
  key: string;
  overdue: boolean;
  /** Days from today to the due date (negative once overdue). */
  days: number;
};

/** `t:{id}:{dueOn}` for a pending entry, `f:{id}:{dueDate}` for an invoice. */
export function billKey(item: BillCandidate): string {
  return `${item.type === "invoice" ? "f" : "t"}:${item.id}:${item.dueOn}`;
}

/**
 * The bills for today's "Contas a vencer": those due from today up to
 * `leadDays` ahead, and those that went overdue in the last
 * {@link OVERDUE_WINDOW_DAYS} days, each once before the due date and once
 * overdue, skipping keys already notified. Upcoming first (soonest first),
 * then overdue (most recent first).
 */
export function selectBillReminders<T extends BillCandidate>(
  items: readonly T[],
  {
    todayIso,
    leadDays,
    notifiedKeys,
  }: { todayIso: string; leadDays: number; notifiedKeys: ReadonlySet<string> },
): BillReminder<T>[] {
  const today = parse(todayIso);
  const upcoming: BillReminder<T>[] = [];
  const overdue: BillReminder<T>[] = [];
  for (const item of items) {
    const days = daysBetween(today, parse(item.dueOn));
    if (days >= 0 && days <= leadDays) {
      const key = billKey(item);
      if (!notifiedKeys.has(key)) {
        upcoming.push({ item, key, overdue: false, days });
      }
    } else if (days < 0 && days >= -OVERDUE_WINDOW_DAYS) {
      const key = `${billKey(item)}${OVERDUE_SUFFIX}`;
      if (!notifiedKeys.has(key)) {
        overdue.push({ item, key, overdue: true, days });
      }
    }
  }
  upcoming.sort((a, b) => a.days - b.days);
  overdue.sort((a, b) => b.days - a.days);
  return [...upcoming, ...overdue];
}

/** Days ahead the "Próxima receita" looks for an income. */
export const INCOME_HORIZON_DAYS = 7;

/**
 * The income the countdown is about: from tomorrow up to `horizonDays`
 * ahead (today's and overdue ones are left out), the soonest; on the same
 * day, the largest.
 */
export function pickNextIncome<
  T extends { amountCents: number; occurredOn: string },
>(
  entries: readonly T[],
  todayIso: string,
  horizonDays: number = INCOME_HORIZON_DAYS,
): T | null {
  const today = parse(todayIso);
  let best: T | null = null;
  for (const entry of entries) {
    if (entry.amountCents <= 0) continue;
    const days = daysBetween(today, parse(entry.occurredOn));
    if (days < 1 || days > horizonDays) continue;
    if (
      !best ||
      entry.occurredOn < best.occurredOn ||
      (entry.occurredOn === best.occurredOn &&
        entry.amountCents > best.amountCents)
    ) {
      best = entry;
    }
  }
  return best;
}
