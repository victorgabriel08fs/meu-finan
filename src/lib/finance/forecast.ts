import {
  assertDate,
  assertYearMonth,
  compare,
  compareMonths,
  type LocalDate,
  type YearMonth,
} from "./dates";
import { invoiceOutstandingCents } from "./invoices";
import { assertCents } from "./money";

export type PendingEntry = {
  /** Ledger sign: income > 0, expense < 0. */
  amountCents: number;
  occurredOn: LocalDate;
  /** Entry on a credit-card account: it is already inside an invoice, so it is skipped. */
  onCreditCard?: boolean;
  /** Scheduled payment of an invoice: the invoice's outstanding amount already counts it. */
  paysInvoice?: boolean;
};

export type InvoiceObligation = {
  dueDate: LocalDate;
  /** Amount owed (−Σ purchases and refunds of the invoice). */
  totalCents: number;
  /** Payments already made (paid transfers linked to the invoice). */
  paidCents: number;
};

export type ForecastInput = {
  /** "Saldo em contas": paid balances of the net-worth accounts, credit cards excluded. */
  balanceCents: number;
  /** Pending entries of those same accounts (and card entries, flagged and skipped). */
  pending: readonly PendingEntry[];
  invoices: readonly InvoiceObligation[];
  /** Last day of the forecast, usually the end of the period. */
  until: LocalDate;
};

export type Forecast = {
  balanceCents: number;
  pendingIncomeCents: number;
  /** Magnitude (positive). */
  pendingExpenseCents: number;
  /** Outstanding amount of invoices due up to `until`. */
  invoicesDueCents: number;
  forecastCents: number;
};

/**
 * "Saldo previsto" (doc 03 §12): balance + pending income − pending expenses
 * dated up to `until` outside credit cards − outstanding amount of invoices due
 * up to `until`. Pending card purchases are already in their invoice, and a
 * scheduled invoice payment is already the invoice's outstanding amount, so
 * neither is counted twice. Overdue pending entries (dated before today) count.
 */
export function forecastBalance(input: ForecastInput): Forecast {
  const { balanceCents, pending, invoices, until } = input;
  assertCents(balanceCents, "balanceCents");
  assertDate(until, "until");

  let pendingIncomeCents = 0;
  let pendingExpenseCents = 0;
  for (const entry of pending) {
    assertCents(entry.amountCents, "pending.amountCents");
    assertDate(entry.occurredOn, "pending.occurredOn");
    if (entry.onCreditCard || entry.paysInvoice) continue;
    if (compare(entry.occurredOn, until) > 0) continue;
    if (entry.amountCents > 0) pendingIncomeCents += entry.amountCents;
    else pendingExpenseCents -= entry.amountCents;
  }

  let invoicesDueCents = 0;
  for (const invoice of invoices) {
    const outstanding = invoiceOutstandingCents(
      invoice.totalCents,
      invoice.paidCents,
    );
    if (compare(invoice.dueDate, until) <= 0) invoicesDueCents += outstanding;
  }

  const forecastCents =
    balanceCents + pendingIncomeCents - pendingExpenseCents - invoicesDueCents;
  assertCents(forecastCents, "forecast");
  return {
    balanceCents,
    pendingIncomeCents,
    pendingExpenseCents,
    invoicesDueCents,
    forecastCents,
  };
}

export type MonthTotals = {
  /** Financial month (period label). */
  month: YearMonth;
  incomeCents: number;
  /** Magnitude of the expenses (positive), transfers excluded. */
  expenseCents: number;
};

export type SavingsRate = {
  /** (income − expenses) / income; null when there is no income to divide by. */
  rate: number | null;
  incomeCents: number;
  expenseCents: number;
  monthsCounted: number;
  /** First and last months counted, for the label ("de nov/25 a set/26"). */
  from: YearMonth | null;
  to: YearMonth | null;
};

/**
 * Savings rate (doc 03 §12) over complete months only: the current month (and
 * any later one) is left out, otherwise a month with the salary already in and
 * the bills still to come inflates the ratio. Pass one entry per month.
 */
export function savingsRate(input: {
  months: readonly MonthTotals[];
  /** Label of the period that contains today. */
  currentMonth: YearMonth;
}): SavingsRate {
  assertYearMonth(input.currentMonth, "currentMonth");
  let incomeCents = 0;
  let expenseCents = 0;
  let monthsCounted = 0;
  let from: YearMonth | null = null;
  let to: YearMonth | null = null;
  for (const entry of input.months) {
    assertYearMonth(entry.month, "months.month");
    assertCents(entry.incomeCents, "months.incomeCents");
    assertCents(entry.expenseCents, "months.expenseCents");
    if (compareMonths(entry.month, input.currentMonth) >= 0) continue;
    incomeCents += entry.incomeCents;
    expenseCents += entry.expenseCents;
    monthsCounted += 1;
    const month = { year: entry.month.year, month: entry.month.month };
    if (from === null || compareMonths(month, from) < 0) from = month;
    if (to === null || compareMonths(month, to) > 0) to = month;
  }
  return {
    rate: incomeCents > 0 ? (incomeCents - expenseCents) / incomeCents : null,
    incomeCents,
    expenseCents,
    monthsCounted,
    from,
    to,
  };
}
