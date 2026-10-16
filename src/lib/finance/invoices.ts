import {
  addMonths,
  assertDate,
  assertYearMonth,
  atDay,
  compare,
  type LocalDate,
  toYearMonth,
  type YearMonth,
} from "./dates";
import { show } from "./guards";
import { assertCents } from "./money";

/** Closing and due days of a credit card (1–31, clamped to short months). */
export type CardCycle = { closingDay: number; dueDay: number };

/** An invoice is identified by the month of its due date (`reference_month`). */
export type InvoiceDates = {
  closingDate: LocalDate;
  dueDate: LocalDate;
  referenceMonth: YearMonth;
};

/** Fatura aberta, fechada, paga, vencida. */
export type InvoiceStatus = "open" | "closed" | "paid" | "overdue";

const isDay = (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 31;

/**
 * Both days within 1–31, and the due date always after the closing date. With
 * a same-month due day and a closing day of 28 or later, both days clamp to the
 * same date in short months (closing 30 / due 31 in April), so those cycles are
 * rejected; the card form should apply this same check.
 */
export function isValidCardCycle(card: CardCycle): boolean {
  if (typeof card !== "object" || card === null) return false;
  const { closingDay, dueDay } = card;
  return (
    isDay(closingDay) &&
    isDay(dueDay) &&
    !(dueDay > closingDay && closingDay >= 28)
  );
}

function assertCardCycle(card: CardCycle): void {
  if (!isValidCardCycle(card)) {
    throw new RangeError(
      `card must have closingDay and dueDay in 1–31 with the due date after the closing date (received ${show(card)})`,
    );
  }
}

function invoiceClosingIn(
  closingMonth: YearMonth,
  card: CardCycle,
): InvoiceDates {
  const dueMonth =
    card.dueDay > card.closingDay ? closingMonth : addMonths(closingMonth, 1);
  return {
    closingDate: atDay(closingMonth.year, closingMonth.month, card.closingDay),
    dueDate: atDay(dueMonth.year, dueMonth.month, card.dueDay),
    referenceMonth: { year: dueMonth.year, month: dueMonth.month },
  };
}

/**
 * Invoice of a purchase (doc 03 §9.1): a purchase on the closing day or later
 * goes to the next invoice; the due date falls in the closing month when
 * `dueDay > closingDay`, otherwise in the following month.
 */
export function invoiceFor(purchase: LocalDate, card: CardCycle): InvoiceDates {
  assertDate(purchase, "purchase");
  assertCardCycle(card);
  const closing = atDay(purchase.year, purchase.month, card.closingDay);
  const closingMonth =
    compare(purchase, closing) >= 0
      ? addMonths(purchase, 1)
      : toYearMonth(purchase);
  return invoiceClosingIn(closingMonth, card);
}

/** Dates of the invoice due in `referenceMonth`, e.g. to create the `card_invoices` row. */
export function invoiceForReferenceMonth(
  referenceMonth: YearMonth,
  card: CardCycle,
): InvoiceDates {
  assertYearMonth(referenceMonth, "referenceMonth");
  assertCardCycle(card);
  const closingMonth =
    card.dueDay > card.closingDay
      ? referenceMonth
      : addMonths(referenceMonth, -1);
  return invoiceClosingIn(closingMonth, card);
}

/**
 * Derived invoice status (doc 03 §9.3), in this order: open before the closing
 * date (even if already paid in advance); paid once payments cover the total;
 * closed until the due date; overdue after it. `totalCents` is the amount owed
 * (−Σ purchases and refunds) and `paidCents` the linked payments.
 */
export function invoiceStatus(input: {
  closingDate: LocalDate;
  dueDate: LocalDate;
  totalCents: number;
  paidCents: number;
  today: LocalDate;
}): InvoiceStatus {
  const { closingDate, dueDate, totalCents, paidCents, today } = input;
  assertCents(totalCents, "totalCents");
  assertCents(paidCents, "paidCents");
  if (compare(closingDate, dueDate) >= 0) {
    throw new RangeError(
      `dueDate must be after closingDate (received ${show({ closingDate, dueDate })})`,
    );
  }
  if (compare(today, closingDate) < 0) return "open";
  if (paidCents >= totalCents) return "paid";
  return compare(today, dueDate) <= 0 ? "closed" : "overdue";
}

/** What is still owed on an invoice (never negative). */
export function invoiceOutstandingCents(
  totalCents: number,
  paidCents: number,
): number {
  assertCents(totalCents, "totalCents");
  assertCents(paidCents, "paidCents");
  return Math.max(0, totalCents - paidCents);
}
