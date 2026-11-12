// Início (doc 02 §6.3): "quanto tenho?", "como está o mês?", "o que vence logo?".
// The other blocks read straight from their domains: periodTotals,
// getBudgets, listGoals.
import { and, between, eq, inArray, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import {
  addDays,
  type Forecast,
  forecastBalance,
  invoiceFor,
  isCountedSavingsBox,
  isInGrace,
  iso,
  isoMonth,
  type NonBusinessDue,
  parse,
  shiftPeriod,
  spendablePerDayByDay,
} from "@/lib/finance";
import { db } from "@/server/db/client";
import { categories, transactions } from "@/server/db/schema";
import type { AccountListItem } from "./accounts";
import { type PeriodRange, resolvePeriod, type UserContext } from "./context";
import { pendingNonBusinessDue } from "./holidays";
import {
  cashFlowReport,
  categoryRootId,
  liquidPendingFlows,
  rootCategory,
} from "./reports";
import {
  accountsOf,
  cardInvoicesOf,
  pendingUntil,
  spendableAccountsOf,
} from "./request-reads";

export type UpcomingItem = {
  id: string;
  type: "transaction" | "invoice";
  title: string;
  dueOn: string;
  amountCents: number;
  overdue: boolean;
  icon: string;
  color: string;
  accountName: string;
  /** Invoice: the card account, for the link. */
  accountId: string;
  /** Due on a non-business day (flag alerta_dia_nao_util; see withNonBusinessDue). */
  nonBusinessDue?: NonBusinessDue | null;
};

export type Insight = {
  key: string;
  tone: "positive" | "attention";
  categoryName: string;
  categoryId: string;
  changeRatio: number;
  text: string;
};

// One loader per block of the Início, so each block streams on its own and
// only the visible ones read anything. What several blocks share is read once
// per request (./request-reads).

export type BalanceSummary = {
  balanceCents: number;
  monthChangeCents: number;
  forecast: Forecast;
  /** Sum of the caixinhas in the net worth; null when there is none. */
  savingsBoxCents: number | null;
};

/** Saldo em contas: spendable balance, its change in the period, the forecast. */
export async function getBalanceSummary(
  ctx: UserContext,
  range: PeriodRange,
): Promise<BalanceSummary> {
  const [accounts, spendable] = await Promise.all([
    accountsOf(ctx),
    spendableAccountsOf(ctx),
  ]);
  const spendableIds = spendable.map((account) => account.id);
  const boxes = accounts.filter(isCountedSavingsBox);
  const [{ balanceCents, forecast }, monthChange] = await Promise.all([
    forecastUntil(ctx, range.end),
    monthChangeCents(ctx, range, spendableIds),
  ]);
  return {
    balanceCents,
    monthChangeCents: monthChange,
    forecast,
    savingsBoxCents:
      boxes.length === 0
        ? null
        : boxes.reduce((sum, account) => sum + account.balanceCents, 0),
  };
}

export type LiquidForecast = {
  /** Saldo em contas: paid balances of the spendable accounts. */
  balanceCents: number;
  forecast: Forecast;
};

/**
 * Saldo previsto up to a day (doc 03 §12): the end of the period for the
 * Saldo, the day before an income for "quanto dá para gastar por dia até lá"
 * (the daily notices).
 */
export async function forecastUntil(
  ctx: UserContext,
  until: string,
): Promise<LiquidForecast> {
  const liquid = await spendableAccountsOf(ctx);
  const liquidIds = new Set(liquid.map((account) => account.id));
  const balanceCents = liquid.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );
  const [pending, { invoicesByCard }] = await Promise.all([
    pendingUntil(ctx, until),
    cardInvoicesOf(ctx),
  ]);
  const forecast = forecastBalance({
    balanceCents,
    // A pending transfer counts by its other leg: between liquid accounts it
    // nets out, into a card it pays an invoice (already counted below).
    pending: liquidPendingFlows(pending, liquidIds).map((flow) => flow.entry),
    invoices: invoicesByCard.flat().map((invoice) => ({
      dueDate: parse(invoice.dueDate),
      totalCents: invoice.totalCents,
      paidCents: invoice.paidCents,
    })),
    until: parse(until),
  });
  return { balanceCents, forecast };
}

/**
 * Próximas contas (doc 02 §6.3): pending expenses off the cards and open
 * invoices due up to 7 days from today, overdue ones included. Always counted
 * from today, whatever month the Início shows (`?mes=`): across the turn of
 * the month too, unlike the forecast, which stops at the end of the period.
 */
export async function getUpcoming(ctx: UserContext): Promise<UpcomingItem[]> {
  const horizon = iso(addDays(ctx.today, 7));
  const [pending, { cards, invoicesByCard }] = await Promise.all([
    pendingUntil(ctx, horizon),
    cardInvoicesOf(ctx),
  ]);
  return [
    ...pending
      .filter(
        (entry) =>
          entry.kind === "expense" && entry.accountType !== "credit_card",
      )
      .map((entry) => ({
        id: entry.id,
        type: "transaction" as const,
        title: entry.description,
        dueOn: entry.occurredOn,
        amountCents: -entry.amountCents,
        overdue: entry.occurredOn < ctx.todayIso,
        icon: entry.categoryIcon ?? "ellipsis",
        color: entry.categoryColor ?? "neutral",
        accountName: entry.accountName,
        accountId: entry.accountId,
      })),
    ...cards.flatMap((card, index) =>
      (invoicesByCard[index] ?? [])
        .filter(
          (invoice) =>
            invoice.outstandingCents > 0 &&
            invoice.dueDate <= horizon &&
            invoice.status !== "paid",
        )
        .map((invoice) => ({
          id: invoice.id,
          type: "invoice" as const,
          title: `Fatura ${card.name}`,
          dueOn: invoice.dueDate,
          amountCents: invoice.outstandingCents,
          overdue: invoice.status === "overdue",
          icon: "credit-card",
          color: card.color,
          accountName: card.name,
          accountId: card.id,
        })),
    ),
  ].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/**
 * Próximas contas with the non-business day note (flag alerta_dia_nao_util):
 * a bill due on a weekend or holiday gets `nonBusinessDue` while it still
 * matters, and is not overdue in the grace days up to the next business day
 * (it neither goes to the top nor turns red). The caller checks the flag.
 */
export async function withNonBusinessDue(
  items: UpcomingItem[],
  today: string,
): Promise<UpcomingItem[]> {
  const found = await pendingNonBusinessDue(
    items.map((item) => item.dueOn),
    today,
  );
  if (found.size === 0) return items;
  return items.map((item) => {
    const nb = found.get(item.dueOn);
    if (!nb) return item;
    return {
      ...item,
      nonBusinessDue: nb,
      overdue: item.overdue && !isInGrace(item.dueOn, nb, today),
    };
  });
}

export type SpendablePerDay = {
  /** The person has accounts to spend from (no cards or caixinhas). */
  hasAccounts: boolean;
  /** Today and the days after it: up to 14, never past `until`. */
  rows: {
    date: string;
    daysLeft: number;
    perDayCents: number;
  }[];
  /** How far under zero the forecast goes up to `until`; 0 when it does not. */
  shortfallCents: number;
  /** The forecast balance at the end of today; null without accounts. */
  balanceTodayCents: number | null;
  /** End of the financial month the days are counted to, `YYYY-MM-DD`. */
  until: string;
};

/**
 * Quanto dá para gastar por dia (doc 03 §12): for each of the next days, the
 * lowest forecast balance of the spendable accounts from that day to the end
 * of the financial month, spread over the days left. Always from today in the month that
 * contains it, whatever month the Início shows (`?mes=`). Memoised per
 * request.
 */
export const getSpendablePerDay = cache(async function getSpendablePerDay(
  ctx: UserContext,
): Promise<SpendablePerDay> {
  const current = resolvePeriod(ctx, null);
  const report = await cashFlowReport(ctx, current);
  const base = { until: current.end };
  if (!report.hasAccounts) {
    return {
      ...base,
      hasAccounts: false,
      rows: [],
      shortfallCents: 0,
      balanceTodayCents: null,
    };
  }
  const { rows, shortfallCents } = spendablePerDayByDay({
    days: report.days.map((day) => ({
      date: parse(day.date),
      projectedCents: day.projectedCents,
    })),
    today: ctx.today,
    until: parse(current.end),
  });
  return {
    ...base,
    hasAccounts: true,
    rows: rows.map((row) => ({
      date: iso(row.date),
      daysLeft: row.daysLeft,
      perDayCents: row.perDayCents,
    })),
    shortfallCents,
    balanceTodayCents:
      report.days.find((day) => day.date === iso(ctx.today))?.projectedCents ??
      null,
  };
});

export type AccountsStrip = {
  accounts: AccountListItem[];
  /** Per card id: total of the invoice a purchase made today goes to. */
  currentInvoiceCents: Record<string, number>;
};

/** Contas: every account and, for each card, the invoice open today. */
export async function getAccountsStrip(
  ctx: UserContext,
): Promise<AccountsStrip> {
  const [accounts, { cards, invoicesByCard }] = await Promise.all([
    accountsOf(ctx),
    cardInvoicesOf(ctx),
  ]);
  const currentInvoiceCents: Record<string, number> = {};
  cards.forEach((card, index) => {
    if (!card.card) return;
    const month = isoMonth(invoiceFor(ctx.today, card.card).referenceMonth);
    const invoice = invoicesByCard[index]?.find(
      (item) => item.referenceMonth === month,
    );
    currentInvoiceCents[card.id] = invoice?.totalCents ?? 0;
  });
  return { accounts, currentInvoiceCents };
}

/** Net change of the spendable accounts (no cards or caixinhas) since the period started, up to today. */
async function monthChangeCents(
  ctx: UserContext,
  range: PeriodRange,
  accountIds: string[],
): Promise<number> {
  if (accountIds.length === 0) return 0;
  const until = ctx.todayIso < range.end ? ctx.todayIso : range.end;
  if (until < range.start) return 0;
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
        Number,
      ),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, "paid"),
        inArray(transactions.accountId, accountIds),
        between(transactions.occurredOn, range.start, until),
      ),
    );
  return row?.total ?? 0;
}

/**
 * One observation for the Início (doc 03 §12): spending of a category so far
 * in the period vs. the average of the 3 previous periods up to the same day.
 */
export async function categoryInsight(
  ctx: UserContext,
  range: PeriodRange,
): Promise<Insight | null> {
  if (!range.isCurrent) return null;
  const elapsed = Math.round(
    (Date.parse(ctx.todayIso) - Date.parse(range.start)) / 86_400_000,
  );
  if (elapsed < 3) return null;

  const windows = [0, 1, 2, 3].map((k) => {
    const period = shiftPeriod(range.period, -k);
    return {
      k,
      start: iso(period.start),
      end: iso(addDays(period.start, elapsed)),
    };
  });

  // By main category: a subcategory adds up into its parent (D2).
  const spentBy = async (start: string, end: string) =>
    db
      .select({
        categoryId: rootCategory.id,
        name: rootCategory.name,
        cents: sql<number>`-sum(${transactions.amountCents})`.mapWith(Number),
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
          between(transactions.occurredOn, start, end),
        ),
      )
      .groupBy(rootCategory.id, rootCategory.name);

  const [current, ...previous] = await Promise.all(
    windows.map((window) => spentBy(window.start, window.end)),
  );
  if (!current) return null;

  let best: Insight | null = null;
  let bestDiff = 0;
  for (const row of current) {
    if (!row.categoryId) continue;
    const history = previous.map(
      (rows) =>
        rows.find((item) => item.categoryId === row.categoryId)?.cents ?? 0,
    );
    if (history.some((value) => value <= 0)) continue;
    const average =
      history.reduce((sum, value) => sum + value, 0) / history.length;
    const diff = row.cents - average;
    const ratio = diff / average;
    const positive = ratio <= -0.2 && -diff >= 5_000;
    const attention = ratio >= 0.25 && diff >= 8_000;
    if (!positive && !attention) continue;
    if (Math.abs(diff) <= bestDiff) continue;
    bestDiff = Math.abs(diff);
    const pct = Math.round(Math.abs(ratio) * 100);
    best = {
      key: `category:${row.categoryId}:${range.month}`,
      tone: positive ? "positive" : "attention",
      categoryId: row.categoryId,
      categoryName: row.name,
      changeRatio: ratio,
      text: positive
        ? `Até hoje, você gastou ${pct}% menos com ${row.name} do que a média dos últimos 3 meses.`
        : `${row.name} está ${pct}% acima do seu normal para esta altura do mês.`,
    };
  }
  return best;
}
