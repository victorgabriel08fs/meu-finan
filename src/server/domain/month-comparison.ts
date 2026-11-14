import { and, between, eq, isNull, or, sql } from "drizzle-orm";
import {
  type Change,
  compareBreakdown,
  comparisonWindows,
  iso,
  isoMonth,
  type KeyedChange,
  shiftPeriod,
} from "@/lib/finance";
import { db } from "@/server/db/client";
import { categories, transactions } from "@/server/db/schema";
import type { PeriodRange, UserContext } from "./context";
import { categoryRootId, rootCategory } from "./reports";

/** Comparado ao mês passado: at most this many categories. */
export const MONTH_COMPARISON_LIMIT = 3;
/** A category shows only when it changed at least this much (R$ 10,00). */
export const MONTH_COMPARISON_MIN_DIFF_CENTS = 1_000;

/** Key of the expenses without a category; never a uuid. */
const NO_CATEGORY_KEY = "none";

export type MonthComparisonCategory = KeyedChange & {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
};

export type MonthComparison = {
  /** YYYY-MM of the period on screen. */
  month: string;
  /** YYYY-MM of the period before it. */
  previousMonth: string;
  current: { start: string; end: string };
  previous: { start: string; end: string };
  /** Whole periods compared (a past month, or its last day). */
  complete: boolean;
  total: Change;
  /** Biggest changes, `MONTH_COMPARISON_LIMIT` and the minimum applied. */
  categories: MonthComparisonCategory[];
};

/**
 * Comparado ao mês passado (doc 02 §6.3, doc 03 §12): paid expenses of the
 * period on screen up to today against the same days (1..E) of the period
 * before, in total and by main category (a subcategory adds up into its
 * parent). A past period compares whole periods; a future one returns null.
 * Transfers (invoice payments and caixinhas included), adjustments, income,
 * pending and deleted rows do not count; a refund lowers its category, which
 * never goes below 0. Only the person's own rows are read (a group's expense
 * counts in full for who entered it; no shared table is read).
 */
export async function monthComparison(
  ctx: UserContext,
  range: PeriodRange,
): Promise<MonthComparison | null> {
  const previousPeriod = shiftPeriod(range.period, -1);
  const windows = comparisonWindows(range.period, [previousPeriod], ctx.today);
  const previousWindow = windows?.previous[0];
  if (!windows || !previousWindow) return null;
  const cur = {
    start: iso(windows.current.start),
    end: iso(windows.current.end),
  };
  const prev = {
    start: iso(previousWindow.start),
    end: iso(previousWindow.end),
  };

  const spentIn = (start: string, end: string) =>
    sql<number>`coalesce(-sum(${transactions.amountCents}) filter (where ${transactions.occurredOn} between ${start}::date and ${end}::date), 0)`.mapWith(
      Number,
    );

  const rows = await db
    .select({
      categoryId: rootCategory.id,
      name: rootCategory.name,
      icon: rootCategory.icon,
      color: rootCategory.color,
      current: spentIn(cur.start, cur.end),
      previous: spentIn(prev.start, prev.end),
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(rootCategory, eq(rootCategory.id, categoryRootId))
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, "paid"),
        eq(transactions.kind, "expense"),
        or(
          between(transactions.occurredOn, cur.start, cur.end),
          between(transactions.occurredOn, prev.start, prev.end),
        ),
      ),
    )
    .groupBy(
      rootCategory.id,
      rootCategory.name,
      rootCategory.icon,
      rootCategory.color,
    );

  const current = new Map<string, number>();
  const baseline = new Map<string, number>();
  const details = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = row.categoryId ?? NO_CATEGORY_KEY;
    current.set(key, Math.max(0, row.current));
    baseline.set(key, Math.max(0, row.previous));
    details.set(key, row);
  }
  const { total, items } = compareBreakdown(current, baseline, {
    limit: MONTH_COMPARISON_LIMIT,
    minAbsDiffCents: MONTH_COMPARISON_MIN_DIFF_CENTS,
  });

  return {
    month: range.month,
    previousMonth: isoMonth(previousPeriod.label),
    current: cur,
    previous: prev,
    complete: windows.complete,
    total,
    categories: items.map((item) => {
      const row = details.get(item.key);
      return {
        ...item,
        categoryId: row?.categoryId ?? null,
        name: row?.name ?? "Sem categoria",
        icon: row?.icon ?? "ellipsis",
        color: row?.color ?? "neutral",
      };
    }),
  };
}
