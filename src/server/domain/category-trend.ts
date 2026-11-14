import { and, between, eq, isNull, sql } from "drizzle-orm";
import {
  type ComparisonWindows,
  comparisonWindows,
  iso,
  shiftPeriod,
} from "@/lib/finance";
import { db } from "@/server/db/client";
import { categories, transactions } from "@/server/db/schema";
import type { PeriodRange, UserContext } from "./context";
import { categoryRootId, rootCategory } from "./reports";

/** How many previous periods make a category's pattern (doc 03 §12). */
const HISTORY_PERIODS = 3;

export type CategoryTrendRow = {
  categoryId: string;
  name: string;
  /** Spent in days 1..E of the period, >= 0. */
  currentCents: number;
  /** Spent in days 1..E of each of the 3 previous periods, newest first. */
  historyCents: [number, number, number];
};

export type CategorySpendingTrend = {
  windows: ComparisonWindows;
  /** YYYY-MM of the period. */
  month: string;
  rows: CategoryTrendRow[];
};

/**
 * Paid expenses by main category (a subcategory adds up into its parent) in
 * days 1..E of `range` and of each of the 3 periods before it, each clamped
 * to its period's end (`comparisonWindows`, doc 03 §12). Expenses without a
 * category, transfers, adjustments, income, pending and deleted rows do not
 * count; a refund lowers its category, which never goes below 0. Only the
 * person's own rows are read. Null for a period that has not started.
 */
export async function categorySpendingTrend(
  ctx: UserContext,
  range: PeriodRange,
): Promise<CategorySpendingTrend | null> {
  const previous = Array.from({ length: HISTORY_PERIODS }, (_, index) =>
    shiftPeriod(range.period, -(index + 1)),
  );
  const windows = comparisonWindows(range.period, previous, ctx.today);
  const oldest = windows?.previous[HISTORY_PERIODS - 1];
  if (!windows || !oldest) return null;
  const all = [windows.current, ...windows.previous].map((window) => ({
    start: iso(window.start),
    end: iso(window.end),
  }));

  const spentIn = ({ start, end }: { start: string; end: string }) =>
    sql<number>`coalesce(-sum(${transactions.amountCents}) filter (where ${transactions.occurredOn} between ${start}::date and ${end}::date), 0)`.mapWith(
      Number,
    );
  const [cur, h1, h2, h3] = all as [
    (typeof all)[number],
    (typeof all)[number],
    (typeof all)[number],
    (typeof all)[number],
  ];

  const rows = await db
    .select({
      categoryId: rootCategory.id,
      name: rootCategory.name,
      current: spentIn(cur),
      h1: spentIn(h1),
      h2: spentIn(h2),
      h3: spentIn(h3),
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .innerJoin(rootCategory, eq(rootCategory.id, categoryRootId))
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, "paid"),
        eq(transactions.kind, "expense"),
        between(transactions.occurredOn, h3.start, cur.end),
      ),
    )
    .groupBy(rootCategory.id, rootCategory.name);

  return {
    windows,
    month: range.month,
    rows: rows.map((row) => ({
      categoryId: row.categoryId,
      name: row.name,
      currentCents: Math.max(0, row.current),
      historyCents: [
        Math.max(0, row.h1),
        Math.max(0, row.h2),
        Math.max(0, row.h3),
      ],
    })),
  };
}
