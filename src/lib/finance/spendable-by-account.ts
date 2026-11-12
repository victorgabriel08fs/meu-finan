import {
  type CashFlowDay,
  type CashMovement,
  dailyCashFlow,
} from "./cash-flow";
import { assertDate, compare, type LocalDate } from "./dates";
import type { InvoiceObligation, PendingEntry } from "./forecast";
import { show } from "./guards";
import { invoiceOutstandingCents } from "./invoices";
import { assertCents } from "./money";
import { type SpendableDay, spendablePerDayByDay } from "./spendable-by-day";

/**
 * The account an invoice is paid from when nothing is scheduled for it (doc
 * 03 §12): the one chosen on the card, or else the one that paid its last
 * invoice. Only a spendable account counts: a chosen account that is not one
 * (a caixinha, an account out of the net worth) gives null, and the last
 * payment is not tried in its place.
 */
export function invoicePayer(input: {
  /** "Conta que paga a fatura" chosen on the card. */
  configuredId?: string | null;
  /** Account of the card's latest paid invoice payment. */
  lastPaidFromId?: string | null;
  spendableIds: ReadonlySet<string>;
}): string | null {
  const { configuredId, lastPaidFromId, spendableIds } = input;
  if (configuredId) {
    return spendableIds.has(configuredId) ? configuredId : null;
  }
  if (lastPaidFromId && spendableIds.has(lastPaidFromId)) return lastPaidFromId;
  return null;
}

export type InvoiceToAttribute = {
  cardId: string;
  dueDate: LocalDate;
  /** Amount owed (−Σ purchases and refunds). */
  totalCents: number;
  /** Paid payments linked to it. */
  paidCents: number;
  /** Scheduled (pending) payments linked to it, by date: who pays and how much. */
  scheduled: readonly { fromAccountId: string; amountCents: number }[];
};

export type AttributedInvoices = {
  /** Each spendable account's share of the invoices, as obligations of its own. */
  byAccount: Map<string, InvoiceObligation[]>;
  /** What no spendable account pays: it counts only in the total. */
  unassigned: { cardId: string; obligation: InvoiceObligation }[];
};

/**
 * Splits what is still owed on each invoice among the accounts that pay it
 * (doc 03 §12): first the scheduled payments, in order, each up to its amount
 * and to what is left; the rest goes to the card's payer. A part paid from a
 * non-spendable account, or with no payer, is unassigned. The parts add up to
 * the outstanding amount to the cent; an invoice with nothing owed is left
 * out.
 */
export function attributeInvoices(input: {
  invoices: readonly InvoiceToAttribute[];
  /** The payer of each card (`invoicePayer`); a missing card has none. */
  payerByCard: ReadonlyMap<string, string | null>;
  spendableIds: ReadonlySet<string>;
}): AttributedInvoices {
  const { invoices, payerByCard, spendableIds } = input;
  const byAccount = new Map<string, InvoiceObligation[]>();
  const unassigned: AttributedInvoices["unassigned"] = [];

  for (const invoice of invoices) {
    assertDate(invoice.dueDate, "invoices.dueDate");
    let left = invoiceOutstandingCents(invoice.totalCents, invoice.paidCents);
    const assign = (accountId: string | null | undefined, cents: number) => {
      if (cents === 0) return;
      const obligation = {
        dueDate: invoice.dueDate,
        totalCents: cents,
        paidCents: 0,
      };
      if (accountId && spendableIds.has(accountId)) {
        byAccount.set(accountId, [
          ...(byAccount.get(accountId) ?? []),
          obligation,
        ]);
      } else {
        unassigned.push({ cardId: invoice.cardId, obligation });
      }
    };
    for (const payment of invoice.scheduled) {
      assertCents(payment.amountCents, "scheduled.amountCents");
      if (payment.amountCents < 0) {
        throw new RangeError(
          `scheduled.amountCents must not be negative (received ${show(payment.amountCents)})`,
        );
      }
      const part = Math.min(left, payment.amountCents);
      assign(payment.fromAccountId, part);
      left -= part;
    }
    assign(payerByCard.get(invoice.cardId), left);
  }
  return { byAccount, unassigned };
}

export type SpendableAccountInput = {
  id: string;
  /** Paid balance today: initial + Σ paid entries, whatever their date. */
  balanceCents: number;
  /** Paid entries of the account dated today or later; earlier ones are ignored. */
  paidFromToday: readonly CashMovement[];
  /** The account's pending entries, flagged as for `forecastBalance`. */
  pending: readonly PendingEntry[];
};

export type SpendableByAccountInput = {
  accounts: readonly SpendableAccountInput[];
  invoices: readonly InvoiceToAttribute[];
  payerByCard: ReadonlyMap<string, string | null>;
  today: LocalDate;
  /** Last day counted: the end of the financial month. */
  until: LocalDate;
  /** Most rows per account. Default 14. */
  maxDays?: number;
};

export type SpendableAccountSeries = {
  /** Each account's day-by-day cash flow from today to `until`. */
  accounts: { id: string; days: CashFlowDay[] }[];
  /** The forecast of the unassigned invoice parts alone (zero or below). */
  unassignedDays: { date: LocalDate; projectedCents: number }[];
  attributed: AttributedInvoices;
};

function validateAccounts(accounts: readonly SpendableAccountInput[]) {
  const ids = new Set<string>();
  for (const account of accounts) {
    if (ids.has(account.id)) {
      throw new RangeError(
        `accounts must have unique ids (received ${show(account.id)} twice)`,
      );
    }
    ids.add(account.id);
    assertCents(account.balanceCents, "accounts.balanceCents");
  }
  return ids;
}

/**
 * The "saldo previsto" day by day of each spendable account (doc 03 §12),
 * by the rules of the total: the account's balance, its own pending entries
 * (a transfer to another spendable account leaves one and enters the other),
 * and the invoice parts it pays. Each day, the accounts plus the unassigned
 * parts add up to the total's forecast exactly.
 */
export function spendableAccountSeries(
  input: SpendableByAccountInput,
): SpendableAccountSeries {
  const { accounts, invoices, payerByCard, today, until } = input;
  assertDate(today, "today");
  assertDate(until, "until");
  const spendableIds = validateAccounts(accounts);
  const attributed = attributeInvoices({ invoices, payerByCard, spendableIds });
  const period = { start: today, end: until };

  const series = accounts.map((account) => {
    let openingCents = account.balanceCents;
    for (const entry of account.paidFromToday) {
      assertCents(entry.amountCents, "paidFromToday.amountCents");
      assertDate(entry.occurredOn, "paidFromToday.occurredOn");
      // The ledger at the end of yesterday: today's balance minus what was
      // paid from today on (a paid entry dated ahead included).
      if (compare(entry.occurredOn, today) >= 0) {
        openingCents -= entry.amountCents;
      }
    }
    const flow = dailyCashFlow({
      period,
      today,
      openingCents,
      paid: account.paidFromToday,
      pending: account.pending,
      invoices: attributed.byAccount.get(account.id) ?? [],
    });
    return { id: account.id, days: flow.days };
  });

  const rest = dailyCashFlow({
    period,
    today,
    openingCents: 0,
    paid: [],
    pending: [],
    invoices: attributed.unassigned.map((part) => part.obligation),
  });
  return {
    accounts: series,
    unassignedDays: rest.days.map((day) => ({
      date: day.date,
      projectedCents: day.projectedCents ?? 0,
    })),
    attributed,
  };
}

export type SpendableByAccount = {
  accounts: { id: string; rows: SpendableDay[]; shortfallCents: number }[];
  /**
   * Cards with an unassigned part due up to `until` (overdue ones included),
   * once each, in order: their invoices count only in the total.
   */
  unassignedCardIds: string[];
};

/**
 * "Quanto dá para gastar por dia" in each spendable account (doc 03 §12): the
 * rule of the total (`spendablePerDayByDay`) over each account's own
 * forecast. The rows need not add up to the total's: each account's lowest
 * point falls on its own day and each division rounds down.
 */
export function spendablePerDayByAccount(
  input: SpendableByAccountInput,
): SpendableByAccount {
  const { today, until, maxDays } = input;
  const { accounts, attributed } = spendableAccountSeries(input);
  const unassignedCardIds: string[] = [];
  for (const part of attributed.unassigned) {
    if (compare(part.obligation.dueDate, until) > 0) continue;
    if (!unassignedCardIds.includes(part.cardId)) {
      unassignedCardIds.push(part.cardId);
    }
  }
  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      ...spendablePerDayByDay({ days: account.days, today, until, maxDays }),
    })),
    unassignedCardIds,
  };
}
