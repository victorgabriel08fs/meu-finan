// Reports (doc 02 §6.12): income × expenses per financial month, where the
// money went, savings rate, net worth, the daily cash flow and spending per
// day. Accrual basis (purchase date).
import {
  and,
  between,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import {
  addDays,
  addMonths,
  type CashMovement,
  dailyCashFlow,
  type InvoiceObligation,
  iso,
  type PendingEntry,
  parse,
  periodDays,
  type SavingsRate,
  savingsRate,
  shiftPeriod,
} from "@/lib/finance";
import { db } from "@/server/db/client";
import { categories, finAccounts, transactions } from "@/server/db/schema";
import { type AccountListItem, listAccounts } from "./accounts";
import { listInvoices } from "./cards";
import { type PeriodRange, toRange, type UserContext } from "./context";
import { pendingEntries } from "./transactions";

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
  // Without a partial month every point is complete: name one after today's.
  const currentMonth = current
    ? {
        year: Number(current.month.slice(0, 4)),
        month: Number(current.month.slice(5, 7)),
      }
    : addMonths(ctx.today, 1);
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

export type NetWorthBreakdownPoint = {
  month: string;
  /** Assets − liabilities: the same value as `netWorthSeries`. */
  netCents: number;
  /** Σ of the accounts with a positive balance at the end of the period. */
  assetsCents: number;
  /** Σ owed by the accounts with a negative balance (cards, overdraft), positive. */
  liabilitiesCents: number;
};

/**
 * Net worth at the end of each period split into assets and liabilities
 * (doc 02 §6.12, Patrimônio): each account included in the net worth
 * (archived ones too, for their history) is an asset while its balance is
 * positive and a liability while it is negative.
 */
export async function netWorthBreakdown(
  ctx: UserContext,
  current: PeriodRange,
  count = 12,
): Promise<NetWorthBreakdownPoint[]> {
  const periods = trailingPeriods(current, count);
  const first = periods[0];
  if (!first) return [];
  const accounts = (
    await listAccounts(ctx.userId, { includeArchived: true })
  ).filter((account) => account.includeInNetWorth);
  if (accounts.length === 0) {
    return periods.map((period) => ({
      month: period.month,
      netCents: 0,
      assetsCents: 0,
      liabilitiesCents: 0,
    }));
  }

  const bucket = sql<string>`to_char(date_trunc('month', ${transactions.occurredOn} - ${ctx.monthStartDay - 1}::int), 'YYYY-MM')`;
  const rows = await db
    .select({
      accountId: transactions.accountId,
      month: bucket,
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
        Number,
      ),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        inArray(
          transactions.accountId,
          accounts.map((account) => account.id),
        ),
        isNull(transactions.deletedAt),
        eq(transactions.status, "paid"),
        gte(transactions.occurredOn, first.start),
      ),
    )
    // By position: the bucket carries a bind parameter (see monthlySeries).
    .groupBy(sql`1`, sql`2`);

  // Each balance before the window: today's balance minus what was paid since
  // (entries dated after the last period included, so they never count).
  const balances = new Map(
    accounts.map((account) => [account.id, account.balanceCents]),
  );
  const moves = new Map<string, Map<string, number>>();
  for (const row of rows) {
    balances.set(row.accountId, (balances.get(row.accountId) ?? 0) - row.total);
    const month = moves.get(row.month) ?? new Map<string, number>();
    month.set(row.accountId, row.total);
    moves.set(row.month, month);
  }

  return periods.map((period) => {
    const month = moves.get(period.month);
    let assetsCents = 0;
    let liabilitiesCents = 0;
    for (const account of accounts) {
      const balance =
        (balances.get(account.id) ?? 0) + (month?.get(account.id) ?? 0);
      balances.set(account.id, balance);
      if (balance >= 0) assetsCents += balance;
      else liabilitiesCents -= balance;
    }
    return {
      month: period.month,
      netCents: assetsCents - liabilitiesCents,
      assetsCents,
      liabilitiesCents,
    };
  });
}

/** Where a period stands against today: done, running or still ahead. */
export type ReportPhase = "past" | "current" | "future";

export function reportPhase(ctx: UserContext, range: PeriodRange): ReportPhase {
  if (range.end < ctx.todayIso) return "past";
  if (range.start > ctx.todayIso) return "future";
  return "current";
}

export type CashFlowScheduledItem = {
  /** When it moves the balance (`YYYY-MM-DD`): its date, or today when overdue. */
  date: string;
  /** Entry description, or "Fatura <cartão>". */
  label: string;
  /** Signed cents: income > 0. */
  amountCents: number;
  kind: "entry" | "invoice";
  overdue: boolean;
};

export type CashFlowDayPoint = {
  date: string;
  realizedCents: number | null;
  projectedCents: number | null;
};

export type CashFlowReport = {
  phase: ReportPhase;
  /** The user has liquid accounts (outside cards, in the net worth, active). */
  hasAccounts: boolean;
  days: CashFlowDayPoint[];
  /** Balance before the first day (projected when the month is ahead). */
  startCents: number;
  /** Balance on the last day: realized for a past month, projected otherwise. */
  endCents: number;
  lowestRealized: { date: string; cents: number } | null;
  lowestProjected: { date: string; cents: number } | null;
  /** Pending entries and invoices inside the projection, by date. */
  scheduled: CashFlowScheduledItem[];
  /** Paid entries of those accounts dated inside the month. */
  paidCount: number;
};

/** "Saldo em contas" of Início: outside cards, in the net worth, active. */
const isLiquid = (account: AccountListItem) =>
  account.type !== "credit_card" &&
  account.includeInNetWorth &&
  !account.archived;

/** What `liquidPendingFlows` needs of a pending entry (see `pendingEntries`). */
export type PendingRow = {
  id: string;
  accountId: string;
  accountType: string;
  amountCents: number;
  occurredOn: string;
  transferId: string | null;
};

/**
 * The pending entries that move the liquid balance, as `forecastBalance`
 * inputs. Entries outside the liquid accounts are left out (card purchases
 * are inside their invoice). A transfer is judged by its other leg: between
 * two liquid accounts it nets out and is left out; into a card it pays an
 * invoice, whose outstanding amount already counts (`paysInvoice`); to or
 * from any other account it moves money like an expense or an income. Pure.
 */
export function liquidPendingFlows<T extends PendingRow>(
  pending: readonly T[],
  liquidIds: ReadonlySet<string>,
): { entry: PendingEntry; row: T }[] {
  const legs = new Map<string, T[]>();
  for (const row of pending) {
    if (!row.transferId) continue;
    legs.set(row.transferId, [...(legs.get(row.transferId) ?? []), row]);
  }
  const flows: { entry: PendingEntry; row: T }[] = [];
  for (const row of pending) {
    if (!liquidIds.has(row.accountId)) continue;
    let paysInvoice = false;
    if (row.transferId) {
      const other = legs.get(row.transferId)?.find((leg) => leg.id !== row.id);
      if (other && liquidIds.has(other.accountId)) continue;
      paysInvoice = other?.accountType === "credit_card";
    }
    flows.push({
      entry: {
        amountCents: row.amountCents,
        occurredOn: parse(row.occurredOn),
        paysInvoice,
      },
      row,
    });
  }
  return flows;
}

/**
 * Fluxo de caixa (doc 02 §6.12, doc 03 §12): the balance of the liquid
 * accounts day by day in the financial month — realized up to today, then
 * projected with the pending entries and the card invoices due, by the rules
 * of the "saldo previsto" of Início. A transfer between two liquid accounts
 * nets out; one into a card pays an invoice, whose amount already counts.
 */
export async function cashFlowReport(
  ctx: UserContext,
  range: PeriodRange,
): Promise<CashFlowReport> {
  const phase = reportPhase(ctx, range);
  const accounts = await listAccounts(ctx.userId);
  const liquid = accounts.filter(isLiquid);
  if (liquid.length === 0) {
    return {
      phase,
      hasAccounts: false,
      days: [],
      startCents: 0,
      endCents: 0,
      lowestRealized: null,
      lowestProjected: null,
      scheduled: [],
      paidCount: 0,
    };
  }
  const liquidIds = new Set(liquid.map((account) => account.id));
  const cards = accounts.filter((account) => account.type === "credit_card");
  const projects = phase !== "past";

  const [paidRows, pending, invoicesByCard] = await Promise.all([
    db
      .select({
        day: transactions.occurredOn,
        total:
          sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
            Number,
          ),
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, ctx.userId),
          inArray(transactions.accountId, [...liquidIds]),
          isNull(transactions.deletedAt),
          eq(transactions.status, "paid"),
          gte(transactions.occurredOn, range.start),
        ),
      )
      .groupBy(transactions.occurredOn),
    projects ? pendingEntries(ctx, range.end) : Promise.resolve([]),
    projects
      ? Promise.all(cards.map((card) => listInvoices(ctx, card.id)))
      : Promise.resolve([]),
  ]);

  // The ledger before the month: today's balance minus everything paid since.
  const balanceCents = liquid.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );
  const openingCents = paidRows.reduce(
    (sum, row) => sum - row.total,
    balanceCents,
  );
  const inMonth = paidRows.filter((row) => row.day <= range.end);
  const paid: CashMovement[] = inMonth.map((row) => ({
    amountCents: row.total,
    occurredOn: parse(row.day),
  }));

  const flows = liquidPendingFlows(pending, liquidIds).map(
    ({ entry, row }) => ({ entry, label: row.description }),
  );
  const invoices: { obligation: InvoiceObligation; label: string }[] =
    cards.flatMap((card, index) =>
      (invoicesByCard[index] ?? []).map((invoice) => ({
        obligation: {
          dueDate: parse(invoice.dueDate),
          totalCents: invoice.totalCents,
          paidCents: invoice.paidCents,
        },
        label: `Fatura ${card.name}`,
      })),
    );

  const flow = dailyCashFlow({
    period: { start: range.period.start, end: range.period.end },
    today: ctx.today,
    openingCents,
    paid,
    pending: flows.map((item) => item.entry),
    invoices: invoices.map((item) => item.obligation),
  });
  const lowPoint = (low: typeof flow.lowestRealized) =>
    low ? { date: iso(low.date), cents: low.balanceCents } : null;

  return {
    phase,
    hasAccounts: true,
    days: flow.days.map((day) => ({
      date: iso(day.date),
      realizedCents: day.realizedCents,
      projectedCents: day.projectedCents,
    })),
    startCents: flow.startCents,
    endCents: flow.endCents,
    lowestRealized: lowPoint(flow.lowestRealized),
    lowestProjected: lowPoint(flow.lowestProjected),
    scheduled: flow.scheduled.map((item) => ({
      date: iso(item.date),
      label:
        (item.source === "pending"
          ? flows[item.index]?.label
          : invoices[item.index]?.label) ?? "",
      amountCents: item.amountCents,
      kind: item.source === "pending" ? "entry" : "invoice",
      overdue: item.overdue,
    })),
    paidCount: inMonth.reduce((sum, row) => sum + row.count, 0),
  };
}

export type DaySpending = {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Paid expenses of the day (magnitude); refunds reduce it, never below 0. */
  paidCents: number;
  paidCount: number;
  /** Scheduled or overdue expenses of the day (magnitude). */
  pendingCents: number;
  pendingCount: number;
};

const paidSpent =
  sql<number>`coalesce(-sum(${transactions.amountCents}) filter (where ${transactions.status} = 'paid'), 0)`.mapWith(
    Number,
  );
const paidCounted =
  sql<number>`count(*) filter (where ${transactions.status} = 'paid')`.mapWith(
    Number,
  );
const pendingSpent =
  sql<number>`coalesce(-sum(${transactions.amountCents}) filter (where ${transactions.status} = 'pending'), 0)`.mapWith(
    Number,
  );
const pendingCounted =
  sql<number>`count(*) filter (where ${transactions.status} = 'pending')`.mapWith(
    Number,
  );

/**
 * Spending per day of the financial month (doc 02 §6.12, Calendário): every
 * day of the period, card purchases on their purchase date, transfers and
 * adjustments left out.
 */
export async function dailySpending(
  ctx: UserContext,
  range: PeriodRange,
): Promise<DaySpending[]> {
  const rows = await db
    .select({
      day: transactions.occurredOn,
      paid: paidSpent,
      paidCount: paidCounted,
      pending: pendingSpent,
      pendingCount: pendingCounted,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        isNull(transactions.deletedAt),
        eq(transactions.kind, "expense"),
        between(transactions.occurredOn, range.start, range.end),
      ),
    )
    .groupBy(transactions.occurredOn);
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: periodDays(range.period) }, (_, offset) => {
    const date = iso(addDays(range.period.start, offset));
    const row = byDay.get(date);
    return {
      date,
      paidCents: Math.max(0, row?.paid ?? 0),
      paidCount: row?.paidCount ?? 0,
      pendingCents: Math.max(0, row?.pending ?? 0),
      pendingCount: row?.pendingCount ?? 0,
    };
  });
}
