import { and, between, eq, inArray, isNull, sql } from "drizzle-orm";
import { clampClosingMonth } from "@/components/reports/views";
import { shiftPeriod } from "@/lib/finance";
import { isSpendableAccount } from "@/lib/finance/spendable";
import { db } from "@/server/db/client";
import { budgets, finAccounts, transactions } from "@/server/db/schema";
import { listAccounts } from "./accounts";
import { getBudgets } from "./budgets";
import {
  type PeriodRange,
  resolvePeriod,
  toRange,
  type UserContext,
} from "./context";
import {
  INSTALLMENTS_ENDING_LIMIT,
  type InstallmentsEnding,
  installmentsEnding,
} from "./dashboard";
import { type MonthComparison, monthComparison } from "./month-comparison";
import { categoryBreakdown, trailingPeriods } from "./reports";
import {
  type MonthlySubscriptions,
  monthlySubscriptions,
  SUBSCRIPTIONS_LIMIT,
} from "./subscriptions";
import { periodTotals } from "./transactions";

export type ClosingBudget = {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  budgetCents: number;
  spentCents: number;
  /** Only in the last closed month; null without an average (subcategory or no spending). */
  averageCents: number | null;
  /** The category's budget in the current month; null without one or outside the last month. */
  nextBudgetCents: number | null;
};

export type MonthClosing = {
  month: string;
  previousMonth: string;
  currentMonth: string;
  start: string;
  end: string;
  /** The last closed month: the only one with actions. */
  latest: boolean;
  incomeCents: number;
  expenseCents: number;
  /** income − expense (paid only); negative when the month fell short. */
  leftCents: number;
  /** Pending income or expenses in the month: they do not count. */
  hasPending: boolean;
  /** null when the month before had nothing paid. */
  previous: { leftCents: number } | null;
  comparison: MonthComparison | null;
  /** null = no budgets in the month. */
  budgets: { metCount: number; over: ClosingBudget[] } | null;
  next: null | {
    subscriptions: MonthlySubscriptions;
    installments: InstallmentsEnding;
    savings: {
      boxes: { id: string; name: string }[];
      spendableId: string | null;
      /** Net transferred to the person's caixinhas since the month's start. */
      savedCents: number;
    };
  };
};

/**
 * The period on screen of Fechamento, the last closed one and the current
 * one. `month` that is null, malformed, current or in the future means the
 * last closed month.
 */
export function closingRange(
  ctx: UserContext,
  month: string | null,
): { range: PeriodRange; lastClosed: PeriodRange; current: PeriodRange } {
  const current = resolvePeriod(ctx, null);
  const lastClosed = toRange(shiftPeriod(current.period, -1), current.period);
  const range = resolvePeriod(ctx, clampClosingMonth(month, lastClosed.month));
  return { range, lastClosed, current };
}

/**
 * Net amount moved into the person's own caixinhas (archived ones too) in
 * [start, end]: a withdrawal subtracts and a move between caixinhas cancels.
 * One aggregate over a JOIN, filtered by the person on both tables.
 */
async function savedInBoxes(
  ctx: UserContext,
  start: string,
  end: string,
): Promise<number> {
  const [row] = await db
    .select({
      saved: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
        Number,
      ),
    })
    .from(transactions)
    .innerJoin(
      finAccounts,
      and(
        eq(finAccounts.id, transactions.accountId),
        eq(finAccounts.userId, ctx.userId),
        eq(finAccounts.type, "savings_box"),
      ),
    )
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        eq(transactions.kind, "transfer"),
        eq(transactions.status, "paid"),
        isNull(transactions.deletedAt),
        between(transactions.occurredOn, start, end),
      ),
    );
  return row?.saved ?? 0;
}

/** Budgets of the current month for some categories (the person's own). */
async function nextBudgetsOf(
  ctx: UserContext,
  month: string,
  categoryIds: string[],
): Promise<Map<string, number>> {
  if (categoryIds.length === 0) return new Map();
  const rows = await db
    .select({
      categoryId: budgets.categoryId,
      amountCents: budgets.amountCents,
    })
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, ctx.userId),
        eq(budgets.month, `${month}-01`),
        inArray(budgets.categoryId, categoryIds),
      ),
    );
  return new Map(rows.map((row) => [row.categoryId, Number(row.amountCents)]));
}

const sortOver = <
  T extends { spentCents: number; budgetCents: number; categoryName: string },
>(
  items: T[],
) =>
  [...items].sort(
    (a, b) =>
      b.spentCents - b.budgetCents - (a.spentCents - a.budgetCents) ||
      a.categoryName.localeCompare(b.categoryName, "pt-BR"),
  );

/**
 * Fechamento do mês (doc 02 §6.12, doc 03 §12): how a finished financial
 * month went, from its own rows (nothing is stored). Paid income and expenses
 * as in the Resumo mensal, the budgets kept or over, the comparison with the
 * month before and, for the last closed month only, what comes next (caixinha
 * savings, budget suggestions, subscriptions and installments). Null while
 * the period has not ended.
 */
export async function monthClosing(
  ctx: UserContext,
  range: PeriodRange,
): Promise<MonthClosing | null> {
  if (range.end >= ctx.todayIso) return null;
  const { lastClosed, current } = closingRange(ctx, range.month);
  const latest = range.month === lastClosed.month;
  const previousRange = toRange(shiftPeriod(range.period, -1), current.period);

  const [totals, previousTotals, budgetOverview, comparison] =
    await Promise.all([
      periodTotals(ctx, range.start, range.end),
      periodTotals(ctx, previousRange.start, previousRange.end),
      getBudgets(ctx, range),
      monthComparison(ctx, range),
    ]);

  const over = budgetOverview.items.filter(
    (item) => item.spentCents > item.budgetCents,
  );
  const incomeCents = Math.max(0, totals.incomeCents);
  const expenseCents = Math.max(0, totals.expenseCents);
  const previousIncome = Math.max(0, previousTotals.incomeCents);
  const previousExpense = Math.max(0, previousTotals.expenseCents);

  let next: MonthClosing["next"] = null;
  let overBudgets: ClosingBudget[] = over.map((item) => ({
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    categoryIcon: item.categoryIcon,
    categoryColor: item.categoryColor,
    budgetCents: item.budgetCents,
    spentCents: item.spentCents,
    averageCents: null,
    nextBudgetCents: null,
  }));

  if (latest) {
    const firstWindow = trailingPeriods(range, 3)[0];
    const [
      accounts,
      subscriptions,
      installments,
      breakdown,
      nextBudgets,
      saved,
    ] = await Promise.all([
      listAccounts(ctx.userId),
      monthlySubscriptions(ctx, SUBSCRIPTIONS_LIMIT),
      installmentsEnding(ctx, INSTALLMENTS_ENDING_LIMIT),
      over.length > 0 && firstWindow
        ? categoryBreakdown(ctx, firstWindow.start, range.end)
        : Promise.resolve(null),
      nextBudgetsOf(
        ctx,
        current.month,
        over.map((item) => item.categoryId),
      ),
      savedInBoxes(ctx, range.start, ctx.todayIso),
    ]);
    const averages = new Map(
      (breakdown?.items ?? []).flatMap((item) =>
        item.categoryId
          ? [[item.categoryId, Math.round(item.cents / 3)] as const]
          : [],
      ),
    );
    overBudgets = overBudgets.map((item) => ({
      ...item,
      averageCents: averages.get(item.categoryId) ?? null,
      nextBudgetCents: nextBudgets.get(item.categoryId) ?? null,
    }));
    next = {
      subscriptions,
      installments,
      savings: {
        boxes: accounts
          .filter((account) => account.type === "savings_box")
          .map((account) => ({ id: account.id, name: account.name })),
        spendableId:
          accounts.find((account) => isSpendableAccount(account))?.id ?? null,
        savedCents: saved,
      },
    };
  }

  return {
    month: range.month,
    previousMonth: previousRange.month,
    currentMonth: current.month,
    start: range.start,
    end: range.end,
    latest,
    incomeCents,
    expenseCents,
    leftCents: incomeCents - expenseCents,
    hasPending:
      totals.pendingIncomeCents !== 0 || totals.pendingExpenseCents !== 0,
    previous:
      previousIncome === 0 && previousExpense === 0
        ? null
        : { leftCents: previousIncome - previousExpense },
    comparison,
    budgets:
      budgetOverview.items.length > 0
        ? {
            metCount: budgetOverview.items.length - over.length,
            over: sortOver(overBudgets),
          }
        : null,
    next,
  };
}
