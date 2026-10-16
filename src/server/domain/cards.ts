// Credit cards and invoices (doc 03 §9). Invoice totals, payments and status
// are derived from the ledger; card_invoices only stores the cycle dates.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import {
  compare,
  type InvoiceDates,
  type InvoiceStatus,
  invoiceFor,
  invoiceOutstandingCents,
  invoiceStatus,
  iso,
  isoMonth,
  parse,
} from "@/lib/finance";
import { db, type Executor } from "@/server/db/client";
import { cardInvoices, finAccounts, transactions } from "@/server/db/schema";
import { listAccounts, requireAccount } from "./accounts";
import type { UserContext } from "./context";
import { DomainError, notFound } from "./errors";

/** Id of the invoice with these dates, created on first use. */
export async function ensureInvoice(
  tx: Executor,
  userId: string,
  accountId: string,
  dates: InvoiceDates,
): Promise<string> {
  const referenceMonth = `${isoMonth(dates.referenceMonth)}-01`;
  const [created] = await tx
    .insert(cardInvoices)
    .values({
      id: uuidv7(),
      userId,
      accountId,
      referenceMonth,
      closingDate: iso(dates.closingDate),
      dueDate: iso(dates.dueDate),
    })
    .onConflictDoNothing({
      target: [cardInvoices.accountId, cardInvoices.referenceMonth],
    })
    .returning({ id: cardInvoices.id });
  if (created) return created.id;
  const [existing] = await tx
    .select({ id: cardInvoices.id })
    .from(cardInvoices)
    .where(
      and(
        eq(cardInvoices.accountId, accountId),
        eq(cardInvoices.referenceMonth, referenceMonth),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("card invoice upsert returned nothing");
  return existing.id;
}

export type InvoiceSummary = {
  id: string;
  /** YYYY-MM of the due date. */
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  /** Amount owed (positive): −Σ purchases and refunds. */
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  status: InvoiceStatus;
  purchases: number;
};

// Aggregates over a LEFT JOIN rather than correlated subqueries: Drizzle drops
// table qualifiers in select fields of single-table queries, which would make
// a correlated reference bind to the inner table.
const owedSum =
  sql<number>`coalesce(-sum(${transactions.amountCents}) filter (where ${transactions.kind} <> 'transfer'), 0)`.mapWith(
    Number,
  );
const paidSum =
  sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.kind} = 'transfer' and ${transactions.status} = 'paid'), 0)`.mapWith(
    Number,
  );
const purchaseCount =
  sql<number>`count(${transactions.id}) filter (where ${transactions.kind} <> 'transfer')`.mapWith(
    Number,
  );

export async function listInvoices(
  ctx: UserContext,
  accountId: string,
  executor: Executor = db,
): Promise<InvoiceSummary[]> {
  const rows = await executor
    .select({
      id: cardInvoices.id,
      referenceMonth: cardInvoices.referenceMonth,
      closingDate: cardInvoices.closingDate,
      dueDate: cardInvoices.dueDate,
      totalCents: owedSum,
      paidCents: paidSum,
      purchases: purchaseCount,
    })
    .from(cardInvoices)
    .leftJoin(
      transactions,
      and(
        eq(transactions.invoiceId, cardInvoices.id),
        isNull(transactions.deletedAt),
      ),
    )
    .where(
      and(
        eq(cardInvoices.userId, ctx.userId),
        eq(cardInvoices.accountId, accountId),
      ),
    )
    .groupBy(cardInvoices.id)
    .orderBy(cardInvoices.referenceMonth);

  return rows.map((row) => {
    const totalCents = Math.max(0, row.totalCents);
    return {
      id: row.id,
      referenceMonth: row.referenceMonth.slice(0, 7),
      closingDate: row.closingDate,
      dueDate: row.dueDate,
      totalCents,
      paidCents: row.paidCents,
      outstandingCents: invoiceOutstandingCents(totalCents, row.paidCents),
      status: invoiceStatus({
        closingDate: parse(row.closingDate),
        dueDate: parse(row.dueDate),
        totalCents,
        paidCents: row.paidCents,
        today: ctx.today,
      }),
      purchases: row.purchases,
    };
  });
}

export type CardOverview = {
  account: { id: string; name: string; color: string; icon: string };
  cycle: { closingDay: number; dueDay: number };
  limitCents: number;
  /** Owed today plus future installments and scheduled purchases. */
  usedCents: number;
  futureCents: number;
  availableCents: number;
  invoices: InvoiceSummary[];
  /** Invoice that receives a purchase made today. */
  currentReferenceMonth: string;
};

export async function getCardOverview(
  ctx: UserContext,
  accountId: string,
): Promise<CardOverview> {
  const accounts = await listAccounts(ctx.userId);
  const account = accounts.find((item) => item.id === accountId);
  if (!account || account.type !== "credit_card" || !account.card) {
    throw notFound("Cartão");
  }
  const owedToday = Math.max(0, -account.balanceCents);
  const futureCents = Math.max(0, -account.pendingCents);
  const usedCents = owedToday + futureCents;
  const cycle = {
    closingDay: account.card.closingDay,
    dueDay: account.card.dueDay,
  };
  return {
    account: {
      id: account.id,
      name: account.name,
      color: account.color,
      icon: account.icon,
    },
    cycle,
    limitCents: account.card.limitCents,
    usedCents,
    futureCents,
    availableCents: account.card.limitCents - usedCents,
    invoices: await listInvoices(ctx, accountId),
    currentReferenceMonth: isoMonth(
      invoiceFor(ctx.today, cycle).referenceMonth,
    ),
  };
}

export type InvoiceEntry = {
  id: string;
  description: string;
  amountCents: number;
  occurredOn: string;
  status: "pending" | "paid";
  kind: "income" | "expense" | "transfer" | "adjustment";
  categoryId: string | null;
  installmentNumber: number | null;
};

export async function listInvoiceEntries(
  ctx: UserContext,
  invoiceId: string,
): Promise<InvoiceEntry[]> {
  return db
    .select({
      id: transactions.id,
      description: transactions.description,
      amountCents: transactions.amountCents,
      occurredOn: transactions.occurredOn,
      status: transactions.status,
      kind: transactions.kind,
      categoryId: transactions.categoryId,
      installmentNumber: transactions.installmentNumber,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        eq(transactions.invoiceId, invoiceId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt));
}

/**
 * "Pagar fatura": a transfer from a regular account to the card whose card leg
 * points at the invoice. Dated in the future it stays scheduled (pending).
 */
export async function payInvoice(
  ctx: UserContext,
  input: {
    invoiceId: string;
    fromAccountId: string;
    amountCents: number;
    occurredOn: string;
  },
): Promise<string> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new DomainError("O valor precisa ser maior que zero.");
  }
  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select({ id: cardInvoices.id, accountId: cardInvoices.accountId })
      .from(cardInvoices)
      .where(
        and(
          eq(cardInvoices.id, input.invoiceId),
          eq(cardInvoices.userId, ctx.userId),
        ),
      )
      .limit(1);
    if (!invoice) throw notFound("Fatura");
    const card = await requireAccount(tx, ctx.userId, invoice.accountId);
    const from = await requireAccount(tx, ctx.userId, input.fromAccountId);
    if (from.type === "credit_card") {
      throw new DomainError(
        "Pague a fatura a partir de uma conta, não de outro cartão.",
      );
    }
    const date = parse(input.occurredOn);
    const status = compare(date, ctx.today) <= 0 ? "paid" : "pending";
    const paidAt = status === "paid" ? new Date() : null;
    const transferId = uuidv7();
    await tx.insert(transactions).values([
      {
        userId: ctx.userId,
        accountId: from.id,
        kind: "transfer",
        status,
        amountCents: -input.amountCents,
        description: `Fatura ${card.name}`,
        occurredOn: input.occurredOn,
        paidAt,
        transferId,
      },
      {
        userId: ctx.userId,
        accountId: card.id,
        kind: "transfer",
        status,
        amountCents: input.amountCents,
        description: `Pagamento da fatura`,
        occurredOn: input.occurredOn,
        paidAt,
        transferId,
        invoiceId: invoice.id,
      },
    ]);
    return transferId;
  });
}

/** Card accounts of the user with their cycle (for pickers and payments). */
export async function listCardAccounts(userId: string) {
  return db
    .select({ id: finAccounts.id, name: finAccounts.name })
    .from(finAccounts)
    .where(
      and(
        eq(finAccounts.userId, userId),
        eq(finAccounts.type, "credit_card"),
        isNull(finAccounts.archivedAt),
      ),
    );
}
