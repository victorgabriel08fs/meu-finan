// Início (doc 02 §6.3): "quanto tenho?", "como está o mês?", "o que vence logo?".
import { and, between, eq, isNull, ne, sql } from "drizzle-orm";
import {
  addDays,
  type Forecast,
  forecastBalance,
  iso,
  parse,
  shiftPeriod,
} from "@/lib/finance";
import { db } from "@/server/db/client";
import { categories, finAccounts, transactions } from "@/server/db/schema";
import { type AccountListItem, listAccounts } from "./accounts";
import { type BudgetOverview, getBudgets } from "./budgets";
import { listInvoices } from "./cards";
import type { PeriodRange, UserContext } from "./context";
import { type GoalItem, listGoals } from "./goals";
import {
  type PeriodTotals,
  pendingEntries,
  periodTotals,
} from "./transactions";

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
};

export type Insight = {
  key: string;
  tone: "positive" | "attention";
  categoryName: string;
  categoryId: string;
  changeRatio: number;
  text: string;
};

export type Dashboard = {
  balanceCents: number;
  monthChangeCents: number;
  forecast: Forecast;
  totals: PeriodTotals;
  budgets: BudgetOverview;
  upcoming: UpcomingItem[];
  accounts: AccountListItem[];
  goals: GoalItem[];
  insight: Insight | null;
};

const isLiquid = (account: AccountListItem) =>
  account.type !== "credit_card" &&
  account.includeInNetWorth &&
  !account.archived;

export async function getDashboard(
  ctx: UserContext,
  range: PeriodRange,
): Promise<Dashboard> {
  const accounts = await listAccounts(ctx.userId);
  const liquid = accounts.filter(isLiquid);
  const liquidIds = new Set(liquid.map((account) => account.id));
  const balanceCents = liquid.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );
  const cards = accounts.filter((account) => account.type === "credit_card");

  const [
    totals,
    budgets,
    goals,
    pending,
    invoicesByCard,
    monthChange,
    insight,
  ] = await Promise.all([
    periodTotals(ctx, range.start, range.end),
    getBudgets(ctx, range),
    listGoals(ctx),
    pendingEntries(ctx, range.end),
    Promise.all(cards.map((card) => listInvoices(ctx, card.id))),
    monthChangeCents(ctx, range, [...liquidIds]),
    categoryInsight(ctx, range),
  ]);

  const invoices = invoicesByCard.flat();
  const forecast = forecastBalance({
    balanceCents,
    pending: pending
      .filter(
        (entry) =>
          liquidIds.has(entry.accountId) || entry.accountType === "credit_card",
      )
      .map((entry) => ({
        amountCents: entry.amountCents,
        occurredOn: parse(entry.occurredOn),
        onCreditCard: entry.accountType === "credit_card",
        paysInvoice: entry.kind === "transfer" && entry.amountCents < 0,
      })),
    invoices: invoices.map((invoice) => ({
      dueDate: parse(invoice.dueDate),
      totalCents: invoice.totalCents,
      paidCents: invoice.paidCents,
    })),
    until: parse(range.end),
  });

  const horizon = iso(addDays(ctx.today, 7));
  const upcoming: UpcomingItem[] = [
    ...pending
      .filter(
        (entry) =>
          entry.kind === "expense" &&
          entry.accountType !== "credit_card" &&
          entry.occurredOn <= horizon,
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

  return {
    balanceCents,
    monthChangeCents: monthChange,
    forecast,
    totals,
    budgets,
    upcoming,
    accounts,
    goals,
    insight,
  };
}

/** Net change of the liquid accounts since the period started, up to today. */
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
    .innerJoin(finAccounts, eq(finAccounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        eq(transactions.status, "paid"),
        ne(finAccounts.type, "credit_card"),
        eq(finAccounts.includeInNetWorth, true),
        isNull(finAccounts.archivedAt),
        between(transactions.occurredOn, range.start, until),
      ),
    );
  return row?.total ?? 0;
}

/**
 * One observation for the Início (doc 03 §12): spending of a category so far
 * in the period vs. the average of the 3 previous periods up to the same day.
 */
async function categoryInsight(
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

  const spentBy = async (start: string, end: string) =>
    db
      .select({
        categoryId: transactions.categoryId,
        name: categories.name,
        cents: sql<number>`-sum(${transactions.amountCents})`.mapWith(Number),
      })
      .from(transactions)
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          isNull(transactions.deletedAt),
          eq(transactions.status, "paid"),
          eq(transactions.kind, "expense"),
          between(transactions.occurredOn, start, end),
        ),
      )
      .groupBy(transactions.categoryId, categories.name);

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
