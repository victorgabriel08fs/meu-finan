import {
  addMonths,
  addMonthsToDate,
  assertDate,
  type LocalDate,
  type YearMonth,
} from "./dates";
import { assertInteger } from "./guards";
import { type CardCycle, invoiceFor } from "./invoices";
import { assertCents } from "./money";

/** Sanity bound; the database allows 2–72 installments. */
export const MAX_INSTALLMENTS = 999;

export type Installment = {
  /** 1-based. */
  number: number;
  amountCents: number;
  /** Purchase day in each month, clamped (31/jan → 28/fev → 31/mar). */
  occurredOn: LocalDate;
  /** Due month of the invoice that receives it; null without a card. */
  invoiceMonth: YearMonth | null;
};

/**
 * Splits a total into `count` installments: base = ⌊|total| / count⌋ and the
 * remainder goes to the first one, as bank statements do. The sum always equals
 * the total. A negative total (ledger sign of an expense) is split by magnitude
 * and keeps its sign, so the first installment is still the largest.
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  assertCents(totalCents, "totalCents");
  assertInteger(count, "count", 1, MAX_INSTALLMENTS);
  const magnitude = Math.abs(totalCents);
  const base = Math.floor(magnitude / count);
  const remainder = magnitude - base * count;
  return Array.from({ length: count }, (_, k) => {
    const amount = k === 0 ? base + remainder : base;
    return totalCents < 0 && amount !== 0 ? -amount : amount;
  });
}

/**
 * Installment k falls on the purchase day k − 1 months later and on the
 * invoice k − 1 months after the first one (consecutive invoices).
 */
export function installmentSchedule(
  purchase: LocalDate,
  totalCents: number,
  count: number,
  card?: CardCycle,
): Installment[] {
  assertDate(purchase, "purchase");
  const amounts = splitInstallments(totalCents, count);
  const first = card ? invoiceFor(purchase, card).referenceMonth : null;
  return amounts.map((amountCents, k) => ({
    number: k + 1,
    amountCents,
    occurredOn: addMonthsToDate(purchase, k),
    invoiceMonth: first ? addMonths(first, k) : null,
  }));
}
