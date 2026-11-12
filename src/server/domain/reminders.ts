// The data behind each notice of the daily job (doc 01 §9, step
// sendReminders): what the Início and the reports already read, for one
// person at a time. No texts here (src/lib/notifications/messages.ts) and
// no sending (src/server/reminders.ts). The job has no session: every read
// takes the person's own context, a new one per person.
import { and, between, eq, isNull, or, sql } from "drizzle-orm";
import {
  addDays,
  compareToAverage,
  daysBetween,
  iso,
  isSpendableAccount,
  type Period,
  parse,
  periodContaining,
  spendablePerDay,
} from "@/lib/finance";
import type {
  DailySummaryInput,
  IncomeCountdownInput,
  MonthlySummaryInput,
  WeeklySummaryInput,
} from "@/lib/notifications/messages";
import {
  type NotificationPreferences,
  resolveNotificationPreferences,
} from "@/lib/notifications/preferences";
import {
  closedPeriod,
  INCOME_HORIZON_DAYS,
  pickNextIncome,
  previousWeek,
} from "@/lib/notifications/schedule";
import { db } from "@/server/db/client";
import {
  pushSubscriptions,
  transactions,
  user,
  userSettings,
} from "@/server/db/schema";
import { getBudgets } from "./budgets";
import {
  type PeriodRange,
  periodMonthOf,
  resolvePeriod,
  toRange,
  type UserContext,
} from "./context";

export { periodMonthOf };

import {
  forecastUntil,
  getUpcoming,
  type UpcomingItem,
  withNonBusinessDue,
} from "./dashboard";
import { categoryBreakdown } from "./reports";
import { accountsOf, pendingUntil, spendableAccountsOf } from "./request-reads";
import { periodTotals } from "./transactions";

export type ReminderRecipient = {
  userId: string;
  preferences: NotificationPreferences;
};

/**
 * Everyone with at least one device that receives notifications, except
 * blocked accounts, with their choice of notices. The flag is checked by
 * the caller (loadFlagsForUsers), and again by sendPush.
 */
export async function listReminderRecipients(): Promise<ReminderRecipient[]> {
  const rows = await db
    .selectDistinct({
      userId: user.id,
      notificationPrefs: userSettings.notificationPrefs,
    })
    .from(pushSubscriptions)
    .innerJoin(user, eq(user.id, pushSubscriptions.userId))
    .leftJoin(userSettings, eq(userSettings.userId, user.id))
    .where(or(isNull(user.banned), eq(user.banned, false)))
    .orderBy(user.id);
  return rows.map((row) => ({
    userId: row.userId,
    preferences: resolveNotificationPreferences(row.notificationPrefs),
  }));
}

/** Resumo do dia: Saldo em contas, what is due today, the budget's pace. */
export async function loadDailySummary(
  ctx: UserContext,
): Promise<DailySummaryInput> {
  const liquid = await spendableAccountsOf(ctx);
  const balanceCents = liquid.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );
  if (liquid.length === 0) {
    return {
      hasLiquidAccount: false,
      balanceCents,
      dueToday: [],
      budget: null,
      yesterdayExpenseCents: 0,
    };
  }
  const yesterday = iso(addDays(ctx.today, -1));
  const [upcoming, budgets, totals] = await Promise.all([
    getUpcoming(ctx),
    getBudgets(ctx, resolvePeriod(ctx)),
    periodTotals(ctx, yesterday, yesterday),
  ]);
  return {
    hasLiquidAccount: true,
    balanceCents,
    dueToday: upcoming
      .filter((item) => item.dueOn === ctx.todayIso)
      .map((item) => ({ title: item.title, amountCents: item.amountCents })),
    budget: budgets.total && {
      status: budgets.total.pace.status,
      perDayCents: budgets.total.pace.perDayCents,
    },
    yesterdayExpenseCents: Math.max(0, totals.expenseCents),
  };
}

/**
 * Contas a vencer and Vencimento em dia não útil: the Próximas contas of the
 * Início (overdue included). With `nonBusiness` (the person's flag
 * alerta_dia_nao_util), the bills due on a non-business day carry
 * `nonBusinessDue`.
 */
export async function loadBillCandidates(
  ctx: UserContext,
  { nonBusiness = false }: { nonBusiness?: boolean } = {},
): Promise<UpcomingItem[]> {
  const items = await getUpcoming(ctx);
  return nonBusiness ? withNonBusinessDue(items, ctx.todayIso) : items;
}

/**
 * Próxima receita: the soonest pending income in an account of the Saldo
 * from tomorrow up to `horizonDays`, and how much can be spent per day
 * until then (the forecast up to the day before it, over the days from
 * today to that day).
 */
export async function loadIncomeCountdown(
  ctx: UserContext,
  horizonDays: number = INCOME_HORIZON_DAYS,
): Promise<IncomeCountdownInput | null> {
  const [accounts, pending] = await Promise.all([
    accountsOf(ctx),
    pendingUntil(ctx, iso(addDays(ctx.today, horizonDays))),
  ]);
  const liquidIds = new Set(
    accounts.filter(isSpendableAccount).map((account) => account.id),
  );
  const next = pickNextIncome(
    pending.filter(
      (entry) => entry.kind === "income" && liquidIds.has(entry.accountId),
    ),
    ctx.todayIso,
    horizonDays,
  );
  if (!next) return null;
  const date = parse(next.occurredOn);
  const [{ forecast }, budgets] = await Promise.all([
    forecastUntil(ctx, iso(addDays(date, -1))),
    getBudgets(ctx, resolvePeriod(ctx)),
  ]);
  return {
    description: next.description,
    amountCents: next.amountCents,
    date: next.occurredOn,
    forecastCents: forecast.forecastCents,
    // The same "dá para gastar" as the Resumo do dia when there is a budget.
    perDayCents: spendablePerDay(
      forecast.forecastCents,
      daysBetween(ctx.today, date),
      budgets.total?.pace.perDayCents ?? null,
    ),
    hasBudget: budgets.total !== null,
  };
}

/** Weeks of history the weekly summary compares with. */
const HISTORY_WEEKS = 4;

/**
 * Paid expenses of each of the `weeks` weeks before `start` (oldest
 * first), counted in 7-day steps from `start`, so any weekday works.
 */
async function weeklyExpenses(
  ctx: UserContext,
  start: string,
  weeks: number,
): Promise<number[]> {
  const from = iso(addDays(parse(start), -7 * weeks));
  const to = iso(addDays(parse(start), -1));
  const week = sql<number>`(${transactions.occurredOn} - ${from}::date) / 7`;
  const rows = await db
    .select({
      week: week.mapWith(Number),
      cents: sql<number>`-sum(${transactions.amountCents})`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, "paid"),
        eq(transactions.kind, "expense"),
        between(transactions.occurredOn, from, to),
      ),
    )
    .groupBy(sql`1`);
  const totals = Array.from({ length: weeks }, () => 0);
  for (const row of rows) {
    if (row.week >= 0 && row.week < weeks) totals[row.week] = row.cents;
  }
  return totals;
}

/**
 * Resumo semanal: income and expenses of the week (Monday to Sunday before
 * today), the categories that weighed most, and the comparison with the
 * average of the 4 weeks before it.
 */
export async function loadWeeklySummary(
  ctx: UserContext,
  week: { start: string; end: string } = previousWeek(ctx.today),
): Promise<WeeklySummaryInput> {
  const [totals, breakdown, history] = await Promise.all([
    periodTotals(ctx, week.start, week.end),
    categoryBreakdown(ctx, week.start, week.end),
    weeklyExpenses(ctx, week.start, HISTORY_WEEKS),
  ]);
  const expenseCents = Math.max(0, totals.expenseCents);
  return {
    start: week.start,
    end: week.end,
    incomeCents: Math.max(0, totals.incomeCents),
    expenseCents,
    comparison: compareToAverage(expenseCents, history),
    topCategories: breakdown.items.map((item) => item.name),
  };
}

function rangeOf(ctx: UserContext, period: Period): PeriodRange {
  return toRange(period, periodContaining(ctx.today, ctx.monthStartDay));
}

/**
 * Resumo mensal: the financial month that closed (by default, the one
 * before today's), its paid income and expenses and its budgets, kept
 * (spent ≤ budget) or over.
 */
export async function loadMonthlySummary(
  ctx: UserContext,
  period: Period = closedPeriod(ctx.today, ctx.monthStartDay),
): Promise<MonthlySummaryInput> {
  const range = rangeOf(ctx, period);
  const [totals, budgets] = await Promise.all([
    periodTotals(ctx, range.start, range.end),
    getBudgets(ctx, range),
  ]);
  const over = budgets.items.filter(
    (item) => item.spentCents > item.budgetCents,
  );
  return {
    month: range.month,
    incomeCents: Math.max(0, totals.incomeCents),
    expenseCents: Math.max(0, totals.expenseCents),
    budgets:
      budgets.items.length > 0
        ? {
            met: budgets.items.length - over.length,
            over: over.map((item) => item.categoryName),
          }
        : null,
  };
}
