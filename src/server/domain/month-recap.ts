import { addDays, iso, parse } from "@/lib/finance/dates";
import type { PeriodRange, UserContext } from "./context";
import { biggestExpenses, type TopExpense } from "./dashboard";
import { closingRange, type MonthClosing, monthClosing } from "./month-closing";
import type { CategoryShare } from "./reports";
import { categoryBreakdown, dailySpending } from "./reports";
import { periodTotals } from "./transactions";

/** Para onde foi: the ranking shows this many categories, the rest is summed. */
export const RECAP_TOP_CATEGORIES = 5;
/** The invite on the Início lasts this many days from the month's first day. */
export const RECAP_INVITE_DAYS = 7;

export type MonthRecap = {
  closing: MonthClosing;
  categories: {
    items: CategoryShare[];
    totalCents: number;
    othersCount: number;
    othersCents: number;
  };
  /** The biggest paid expense of the month; null without one. */
  biggest: TopExpense | null;
  /** Paid spending of each day of the month, in order. */
  days: { date: string; paidCents: number }[];
};

/**
 * Retrospectiva do mês (doc 02 §6.12): what the Fechamento reads plus the
 * categories, the biggest expense and the spending of each day of a closed
 * month. Four reads, all filtered by the person; null while the month has
 * not closed.
 */
export async function monthRecap(
  ctx: UserContext,
  range: PeriodRange,
): Promise<MonthRecap | null> {
  const [closing, breakdown, biggest, days] = await Promise.all([
    monthClosing(ctx, range),
    categoryBreakdown(ctx, range.start, range.end),
    biggestExpenses(ctx, 1, { start: range.start, end: range.end }),
    dailySpending(ctx, range),
  ]);
  if (!closing) return null;
  const rest = breakdown.items.slice(RECAP_TOP_CATEGORIES);
  return {
    closing,
    categories: {
      items: breakdown.items.slice(0, RECAP_TOP_CATEGORIES),
      totalCents: breakdown.totalCents,
      othersCount: rest.length,
      othersCents: rest.reduce((sum, item) => sum + item.cents, 0),
    },
    biggest: biggest[0] ?? null,
    days: days.map((day) => ({ date: day.date, paidCents: day.paidCents })),
  };
}

/**
 * The month to invite the person to see on the Início: the last closed one,
 * only in the first `RECAP_INVITE_DAYS` days of the current financial month
 * and when something was paid in it. One read, and only inside the window.
 */
export async function recapInvite(
  ctx: UserContext,
): Promise<{ month: string } | null> {
  const { current, lastClosed } = closingRange(ctx, null);
  const lastDay = iso(addDays(parse(current.start), RECAP_INVITE_DAYS - 1));
  if (ctx.todayIso > lastDay) return null;
  const totals = await periodTotals(ctx, lastClosed.start, lastClosed.end);
  if (totals.incomeCents <= 0 && totals.expenseCents <= 0) return null;
  return { month: lastClosed.month };
}
