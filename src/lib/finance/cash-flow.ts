import {
  addDays,
  assertDate,
  compare,
  daysBetween,
  type LocalDate,
  maxDate,
} from "./dates";
import {
  forecastBalance,
  type InvoiceObligation,
  type PendingEntry,
} from "./forecast";
import { invoiceOutstandingCents } from "./invoices";
import { assertCents } from "./money";

export type CashMovement = {
  /** Ledger sign: inflow > 0, outflow < 0. */
  amountCents: number;
  occurredOn: LocalDate;
};

export type CashFlowInput = {
  /** The financial month, both ends included. */
  period: { start: LocalDate; end: LocalDate };
  today: LocalDate;
  /**
   * Paid balance of the accounts at the end of the day before
   * `period.start` (the ledger: initial balances + paid entries dated before
   * the period, whatever today is).
   */
  openingCents: number;
  /** Paid entries of those accounts dated inside the period; others are ignored. */
  paid: readonly CashMovement[];
  /** Pending entries, flagged as for `forecastBalance`; they count from today on. */
  pending: readonly PendingEntry[];
  invoices: readonly InvoiceObligation[];
};

export type CashFlowDay = {
  date: LocalDate;
  /** End-of-day balance from the paid entries; null after today. */
  realizedCents: number | null;
  /** End-of-day "saldo previsto" (doc 03 §12); null before today. */
  projectedCents: number | null;
};

export type ScheduledFlow = {
  /** When it is expected to move the balance: its own date, or today when overdue. */
  date: LocalDate;
  /** Signed: income > 0; an invoice counts as minus its outstanding amount. */
  amountCents: number;
  /** Dated before today and still pending: it lands on today. */
  overdue: boolean;
  source: "pending" | "invoice";
  /** Position in `pending` or `invoices`. */
  index: number;
};

export type LowPoint = { date: LocalDate; balanceCents: number };

export type DailyCashFlow = {
  /** One entry per day of the period; today has both a realized and a projected balance. */
  days: CashFlowDay[];
  /**
   * Balance before the first day: the opening balance, or — for a period
   * that starts after today — the balance projected to the day before it.
   */
  startCents: number;
  /** Balance on the last day: realized for a past period, projected otherwise. */
  endCents: number;
  /** Lowest realized end-of-day balance (earliest on ties); null when nothing is realized. */
  lowestRealized: LowPoint | null;
  /** Lowest projected end-of-day balance (earliest on ties); null when nothing is projected. */
  lowestProjected: LowPoint | null;
  /**
   * The pending entries and invoices that move the projection inside the
   * period, by date and then by size. Card purchases and invoice payments are
   * left out, as in `forecastBalance`.
   */
  scheduled: ScheduledFlow[];
};

function lowest(
  days: readonly CashFlowDay[],
  key: "realizedCents" | "projectedCents",
): LowPoint | null {
  let low: LowPoint | null = null;
  for (const day of days) {
    const value = day[key];
    if (value === null) continue;
    if (low === null || value < low.balanceCents) {
      low = { date: day.date, balanceCents: value };
    }
  }
  return low;
}

/**
 * "Fluxo de caixa diário" (doc 03 §12): the balance day by day across a
 * period. Up to today it is realized — the opening balance plus the paid
 * entries of each day. From today on it is projected: each day is the "saldo
 * previsto" of `forecastBalance` with that day as the horizon, so the last
 * day of the current period equals the forecast shown on Início, and
 * overdue entries and invoices land on today. A past period has no
 * projection; a period after today is projection only.
 */
export function dailyCashFlow(input: CashFlowInput): DailyCashFlow {
  const { period, today, openingCents, paid, pending, invoices } = input;
  assertDate(period.start, "period.start");
  assertDate(period.end, "period.end");
  assertDate(today, "today");
  if (compare(period.start, period.end) > 0) {
    throw new RangeError("period.end must not be before period.start");
  }
  assertCents(openingCents, "openingCents");

  const length = daysBetween(period.start, period.end) + 1;
  /** Net of the paid entries by day offset in the period. */
  const paidByDay = new Map<number, number>();
  for (const entry of paid) {
    assertCents(entry.amountCents, "paid.amountCents");
    assertDate(entry.occurredOn, "paid.occurredOn");
    const offset = daysBetween(period.start, entry.occurredOn);
    if (offset < 0 || offset >= length) continue;
    paidByDay.set(offset, (paidByDay.get(offset) ?? 0) + entry.amountCents);
  }

  const project = (balanceCents: number, until: LocalDate) =>
    forecastBalance({ balanceCents, pending, invoices, until }).forecastCents;

  const days: CashFlowDay[] = [];
  let ledger = openingCents;
  for (let offset = 0; offset < length; offset++) {
    const date = addDays(period.start, offset);
    ledger += paidByDay.get(offset) ?? 0;
    assertCents(ledger, "balance");
    const position = compare(date, today);
    days.push({
      date,
      realizedCents: position <= 0 ? ledger : null,
      projectedCents: position >= 0 ? project(ledger, date) : null,
    });
  }

  const startCents =
    compare(today, period.start) < 0
      ? project(openingCents, addDays(period.start, -1))
      : openingCents;
  const last = days[days.length - 1] as CashFlowDay;

  const scheduled: ScheduledFlow[] = [];
  const inPeriod = (date: LocalDate) =>
    compare(date, period.start) >= 0 && compare(date, period.end) <= 0;
  pending.forEach((entry, index) => {
    assertCents(entry.amountCents, "pending.amountCents");
    if (entry.onCreditCard || entry.paysInvoice || entry.amountCents === 0) {
      return;
    }
    const date = maxDate(entry.occurredOn, today);
    if (!inPeriod(date)) return;
    scheduled.push({
      date,
      amountCents: entry.amountCents,
      overdue: compare(entry.occurredOn, today) < 0,
      source: "pending",
      index,
    });
  });
  invoices.forEach((invoice, index) => {
    const outstanding = invoiceOutstandingCents(
      invoice.totalCents,
      invoice.paidCents,
    );
    if (outstanding === 0) return;
    const date = maxDate(invoice.dueDate, today);
    if (!inPeriod(date)) return;
    scheduled.push({
      date,
      amountCents: -outstanding,
      overdue: compare(invoice.dueDate, today) < 0,
      source: "invoice",
      index,
    });
  });
  scheduled.sort(
    (a, b) =>
      compare(a.date, b.date) ||
      Math.abs(b.amountCents) - Math.abs(a.amountCents),
  );

  return {
    days,
    startCents,
    endCents: last.projectedCents ?? (last.realizedCents as number),
    lowestRealized: lowest(days, "realizedCents"),
    lowestProjected: lowest(days, "projectedCents"),
    scheduled,
  };
}
