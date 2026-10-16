// Reports (doc 02 §6.12): income × expenses per financial month, where the
// money went, savings rate and net worth. Accrual basis (purchase date).
import { and, between, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  iso,
  parse,
  type SavingsRate,
  savingsRate,
  shiftPeriod,
} from "@/lib/finance";
import { db } from "@/server/db/client";
import { categories, finAccounts, transactions } from "@/server/db/schema";
import { listAccounts } from "./accounts";
import { type PeriodRange, toRange, type UserContext } from "./context";

export type MonthPoint = {
  month: string;
  start: string;
  end: string;
  incomeCents: number;
  expenseCents: number;
  /** The period that contains today (still running). */
  partial: boolean;
};

/** The `count` financial months ending with `range`'s month, oldest first. */
export function trailingPeriods(
  range: PeriodRange,
  count: number,
): PeriodRange[] {
  return Array.from({ length: count }, (_, k) =>
    toRange(shiftPeriod(range.period, k - count + 1), range.period),
  );
}

export async function monthlySeries(
  ctx: UserContext,
  current: PeriodRange,
  count = 12,
): Promise<MonthPoint[]> {
  const periods = trailingPeriods(current, count);
  const first = periods[0];
  const last = periods[periods.length - 1];
  if (!first || !last) return [];
  // Shifting by (startDay − 1) days maps every financial month onto a calendar
  // month. Grouped by position: two bind parameters would not match in GROUP BY.
  const bucket = sql<string>`to_char(date_trunc('month', ${transactions.occurredOn} - ${ctx.monthStartDay - 1}::int), 'YYYY-MM')`;
  const rows = await db
    .select({
      month: bucket,
      income:
        sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.kind} = 'income'), 0)`.mapWith(
          Number,
        ),
      expense:
        sql<number>`coalesce(-sum(${transactions.amountCents}) filter (where ${transactions.kind} = 'expense'), 0)`.mapWith(
          Number,
        ),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, "paid"),
        between(transactions.occurredOn, first.start, last.end),
      ),
    )
    .groupBy(sql`1`);
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return periods.map((period) => {
    const row = byMonth.get(period.month);
    return {
      month: period.month,
      start: period.start,
      end: period.end,
      incomeCents: row?.income ?? 0,
      expenseCents: Math.max(0, row?.expense ?? 0),
      partial: period.start <= ctx.todayIso && ctx.todayIso <= period.end,
    };
  });
}

export function savingsRateOf(
  ctx: UserContext,
  series: MonthPoint[],
): SavingsRate {
  const current = series.find((point) => point.partial);
  const currentMonth = current
    ? {
        year: Number(current.month.slice(0, 4)),
        month: Number(current.month.slice(5, 7)),
      }
    : {
        year: ctx.today.year,
        month: ctx.today.month + 1 > 12 ? 1 : ctx.today.month + 1,
      };
  return savingsRate({
    months: series.map((point) => ({
      month: {
        year: Number(point.month.slice(0, 4)),
        month: Number(point.month.slice(5, 7)),
      },
      incomeCents: point.incomeCents,
      expenseCents: point.expenseCents,
    })),
    currentMonth,
  });
}

export type CategoryShare = {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  cents: number;
  share: number;
};

/** Paid expenses by category in [start, end], largest first. */
export async function categoryBreakdown(
  ctx: UserContext,
  start: string,
  end: string,
): Promise<{ items: CategoryShare[]; totalCents: number }> {
  const spent = sql<number>`-sum(${transactions.amountCents})`.mapWith(Number);
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      cents: spent,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, "paid"),
        eq(transactions.kind, "expense"),
        between(transactions.occurredOn, start, end),
      ),
    )
    .groupBy(
      transactions.categoryId,
      categories.name,
      categories.icon,
      categories.color,
    )
    .orderBy(desc(spent));
  const positive = rows.filter((row) => row.cents > 0);
  const totalCents = positive.reduce((sum, row) => sum + row.cents, 0);
  return {
    totalCents,
    items: positive.map((row) => ({
      categoryId: row.categoryId,
      name: row.name ?? "Sem categoria",
      icon: row.icon ?? "ellipsis",
      color: row.color ?? "neutral",
      cents: row.cents,
      share: totalCents > 0 ? row.cents / totalCents : 0,
    })),
  };
}

export type NetWorthPoint = { month: string; cents: number };

/**
 * Net worth at the end of each period (Σ balances of the accounts included in
 * the net worth, cards as liabilities), from the ledger.
 */
export async function netWorthSeries(
  ctx: UserContext,
  current: PeriodRange,
  count = 12,
): Promise<NetWorthPoint[]> {
  const periods = trailingPeriods(current, count);
  const first = periods[0];
  if (!first) return [];
  const accounts = (
    await listAccounts(ctx.userId, { includeArchived: true })
  ).filter((account) => account.includeInNetWorth);
  if (accounts.length === 0)
    return periods.map((p) => ({ month: p.month, cents: 0 }));
  const ids = accounts.map((account) => account.id);

  const [initialRow] = await db
    .select({
      total:
        sql<number>`coalesce(sum(${finAccounts.initialBalanceCents}), 0)`.mapWith(
          Number,
        ),
    })
    .from(finAccounts)
    .where(inArray(finAccounts.id, ids));
  const [beforeRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
        Number,
      ),
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, ids),
        isNull(transactions.deletedAt),
        eq(transactions.status, "paid"),
        lt(transactions.occurredOn, first.start),
      ),
    );
  const bucket = sql<string>`to_char(date_trunc('month', ${transactions.occurredOn} - ${ctx.monthStartDay - 1}::int), 'YYYY-MM')`;
  const monthly = await db
    .select({
      month: bucket,
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
        Number,
      ),
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, ids),
        isNull(transactions.deletedAt),
        eq(transactions.status, "paid"),
        between(transactions.occurredOn, first.start, iso(parse(current.end))),
      ),
    )
    .groupBy(sql`1`);
  const byMonth = new Map(monthly.map((row) => [row.month, row.total]));
  let running = (initialRow?.total ?? 0) + (beforeRow?.total ?? 0);
  return periods.map((period) => {
    running += byMonth.get(period.month) ?? 0;
    return { month: period.month, cents: running };
  });
}
