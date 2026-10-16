import type { BadgeTone } from "@/components/ui/badge";
import {
  addMonths,
  daysBetween,
  iso,
  isoMonth,
  type LocalDate,
  parse,
  parseMonth,
} from "@/lib/finance/dates";
import {
  type CardCycle,
  type InvoiceStatus,
  invoiceForReferenceMonth,
  invoiceStatus,
} from "@/lib/finance/invoices";
import { shortMonthLabel } from "@/lib/format/date";
import type { InvoiceSummary } from "@/server/domain/cards";

/** Invoice states (doc 02 §6.8): label, badge tone and the tab dot. */
export const INVOICE_STATUS: Record<
  InvoiceStatus,
  { label: string; tone: BadgeTone; text: string; dot: string }
> = {
  open: {
    label: "Aberta",
    tone: "transfer",
    text: "text-transfer",
    dot: "bg-transfer",
  },
  closed: {
    label: "Fechada",
    tone: "warning",
    text: "text-warning",
    dot: "bg-warning-fill",
  },
  paid: {
    label: "Paga",
    tone: "primary",
    text: "text-on-primary-soft",
    dot: "bg-primary",
  },
  overdue: {
    label: "Vencida",
    tone: "danger",
    text: "text-danger",
    dot: "bg-danger",
  },
};

/** "2026-10" ± n months. */
export function shiftReferenceMonth(month: string, delta: number): string {
  return isoMonth(addMonths(parseMonth(month), delta));
}

/** Months with an invoice tab: every invoice, the current one and the one on screen. */
export function invoiceTabMonths(
  invoiceMonths: readonly string[],
  currentMonth: string,
  selectedMonth: string,
): string[] {
  return [...new Set([...invoiceMonths, currentMonth, selectedMonth])].sort();
}

/** "out" in the current year, "jan/27" in another one. */
export function invoiceTabLabel(month: string, currentMonth: string): string {
  const label = shortMonthLabel(month);
  return month.slice(0, 4) === currentMonth.slice(0, 4)
    ? label.replace(/\/\d{2}$/, "")
    : label;
}

export type InvoiceView = Omit<InvoiceSummary, "id"> & {
  /** null while the invoice has no row yet (no purchase so far). */
  id: string | null;
};

/**
 * The invoice due in `month`: the stored one, or an empty one with the dates
 * of the card cycle, so every tab has a closing and a due date to show.
 */
export function invoiceForMonth(
  month: string,
  invoices: readonly InvoiceSummary[],
  cycle: CardCycle,
  today: LocalDate,
): InvoiceView {
  const stored = invoices.find((invoice) => invoice.referenceMonth === month);
  if (stored) return stored;
  const dates = invoiceForReferenceMonth(parseMonth(month), cycle);
  return {
    id: null,
    referenceMonth: month,
    closingDate: iso(dates.closingDate),
    dueDate: iso(dates.dueDate),
    totalCents: 0,
    paidCents: 0,
    outstandingCents: 0,
    status: invoiceStatus({
      closingDate: dates.closingDate,
      dueDate: dates.dueDate,
      totalCents: 0,
      paidCents: 0,
      today,
    }),
    purchases: 0,
  };
}

/** "Fecha em 3 dias", "Vence amanhã", "Fatura paga", "Venceu há 2 dias". */
export function invoiceTiming(
  invoice: { status: InvoiceStatus; closingDate: string; dueDate: string },
  today: string,
): string {
  const now = parse(today);
  switch (invoice.status) {
    case "open": {
      const days = daysBetween(now, parse(invoice.closingDate));
      if (days <= 0) return "Fecha hoje";
      return days === 1 ? "Fecha amanhã" : `Fecha em ${days} dias`;
    }
    case "closed": {
      const days = daysBetween(now, parse(invoice.dueDate));
      if (days <= 0) return "Vence hoje";
      return days === 1 ? "Vence amanhã" : `Vence em ${days} dias`;
    }
    case "paid":
      return "Fatura paga";
    case "overdue": {
      const days = daysBetween(parse(invoice.dueDate), now);
      return days <= 1 ? "Venceu ontem" : `Venceu há ${days} dias`;
    }
  }
}
