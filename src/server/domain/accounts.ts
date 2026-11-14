// Accounts (doc 01 §6): balances are always derived from the ledger.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { invoiceFor, isBenefitType, isValidCardCycle } from "@/lib/finance";
import { db, type Executor } from "@/server/db/client";
import {
  type ColorToken,
  creditCardDetails,
  type FinAccountType,
  finAccounts,
  transactions,
} from "@/server/db/schema";
import { getUserContext, type UserContext } from "./context";
import { DomainError, notFound } from "./errors";
import { ensureInvoice } from "./invoices";

export const ACCOUNT_TYPE_LABELS: Record<FinAccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  investment: "Investimento",
  credit_card: "Cartão de crédito",
  other: "Outra",
  savings_box: "Caixinha",
  benefit: "Benefício",
};

export const ACCOUNT_TYPE_ICONS: Record<FinAccountType, string> = {
  checking: "landmark",
  savings: "piggy-bank",
  cash: "wallet",
  investment: "trending-up",
  credit_card: "credit-card",
  other: "wallet",
  savings_box: "vault",
  benefit: "utensils-crossed",
};

/**
 * Description of the entry that holds the "Fatura atual" informed when a card
 * is created (doc 03 §9.4). Migration 0015 uses the same text.
 */
export const CARD_OPENING_DESCRIPTION = "Valor inicial da fatura";

/**
 * Default color by type: cards violet, caixinhas green, benefícios cat-4, the
 * rest blue.
 */
function defaultAccountColor(type: FinAccountType): ColorToken {
  if (type === "credit_card") return "cat-7";
  if (type === "benefit") return "cat-4";
  return type === "savings_box" ? "cat-6" : "cat-1";
}

export type AccountListItem = {
  id: string;
  name: string;
  type: FinAccountType;
  color: ColorToken;
  icon: string;
  /** Paid balance: initial + Σ paid entries. Negative on cards = amount owed. */
  balanceCents: number;
  /** Pending entries (future-dated or not yet paid). */
  pendingCents: number;
  includeInNetWorth: boolean;
  archived: boolean;
  card: {
    limitCents: number;
    closingDay: number;
    dueDay: number;
    /** "Conta que paga a fatura"; null when none was chosen. */
    paymentAccountId: string | null;
  } | null;
};

// Aggregates over a LEFT JOIN (see cards.ts for why not correlated subqueries).
const paidSum =
  sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.status} = 'paid'), 0)`.mapWith(
    Number,
  );
const pendingSum =
  sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.status} = 'pending'), 0)`.mapWith(
    Number,
  );

export async function listAccounts(
  userId: string,
  options: { includeArchived?: boolean; executor?: Executor } = {},
): Promise<AccountListItem[]> {
  const rows = await (options.executor ?? db)
    .select({
      id: finAccounts.id,
      name: finAccounts.name,
      type: finAccounts.type,
      color: finAccounts.color,
      icon: finAccounts.icon,
      initial: finAccounts.initialBalanceCents,
      paid: paidSum,
      pending: pendingSum,
      includeInNetWorth: finAccounts.includeInNetWorth,
      archivedAt: finAccounts.archivedAt,
      limitCents: creditCardDetails.limitCents,
      closingDay: creditCardDetails.closingDay,
      dueDay: creditCardDetails.dueDay,
      paymentAccountId: creditCardDetails.paymentAccountId,
    })
    .from(finAccounts)
    .leftJoin(
      creditCardDetails,
      eq(creditCardDetails.accountId, finAccounts.id),
    )
    .leftJoin(
      transactions,
      and(
        eq(transactions.accountId, finAccounts.id),
        isNull(transactions.deletedAt),
      ),
    )
    .where(
      and(
        eq(finAccounts.userId, userId),
        options.includeArchived ? undefined : isNull(finAccounts.archivedAt),
      ),
    )
    .groupBy(
      finAccounts.id,
      creditCardDetails.limitCents,
      creditCardDetails.closingDay,
      creditCardDetails.dueDay,
      creditCardDetails.paymentAccountId,
    )
    .orderBy(asc(finAccounts.sortOrder), asc(finAccounts.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    icon: row.icon,
    balanceCents: row.initial + row.paid,
    pendingCents: row.pending,
    includeInNetWorth: row.includeInNetWorth,
    archived: row.archivedAt !== null,
    card:
      row.type === "credit_card" &&
      row.limitCents !== null &&
      row.closingDay !== null &&
      row.dueDay !== null
        ? {
            limitCents: row.limitCents,
            closingDay: row.closingDay,
            dueDay: row.dueDay,
            paymentAccountId: row.paymentAccountId,
          }
        : null,
  }));
}

/** Ownership check: the account exists, belongs to the user and is active. */
export async function requireAccount(
  executor: Executor,
  userId: string,
  accountId: string,
) {
  const [row] = await executor
    .select({
      id: finAccounts.id,
      name: finAccounts.name,
      type: finAccounts.type,
      icon: finAccounts.icon,
      archivedAt: finAccounts.archivedAt,
      closingDay: creditCardDetails.closingDay,
      dueDay: creditCardDetails.dueDay,
    })
    .from(finAccounts)
    .leftJoin(
      creditCardDetails,
      eq(creditCardDetails.accountId, finAccounts.id),
    )
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Conta");
  if (row.archivedAt) throw new DomainError("Esta conta está arquivada.");
  const cycle =
    row.type === "credit_card" && row.closingDay !== null && row.dueDay !== null
      ? { closingDay: row.closingDay, dueDay: row.dueDay }
      : null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    cycle,
  };
}

export type AccountInput = {
  name: string;
  type: FinAccountType;
  color?: ColorToken;
  icon?: string;
  /**
   * Current balance in cents. Cards: amount owed today, positive; it becomes
   * the "Valor inicial da fatura" entry on the current invoice (doc 03 §9.4).
   */
  initialBalanceCents: number;
  includeInNetWorth?: boolean;
  card?: {
    limitCents: number;
    closingDay: number;
    dueDay: number;
    /** "Conta que paga a fatura": an active account of the person, not a card. */
    paymentAccountId?: string | null;
  } | null;
};

/**
 * Checks the account chosen to pay a card's invoices: the person's own,
 * active, and neither a card nor a benefício. Null or undefined pass through.
 */
async function checkPaymentAccount(
  tx: Executor,
  userId: string,
  paymentAccountId: string | null | undefined,
): Promise<void> {
  if (!paymentAccountId) return;
  const payer = await requireAccount(tx, userId, paymentAccountId);
  if (payer.type === "credit_card") {
    throw new DomainError("Escolha uma conta, não um cartão.");
  }
  if (isBenefitType(payer.type)) {
    throw new DomainError(BENEFIT_PAYS_NO_INVOICE);
  }
}

/** A benefício never pays a card's invoice (doc 03 §12). */
export const BENEFIT_PAYS_NO_INVOICE = "O benefício não paga fatura de cartão.";

export async function createAccount(
  userId: string,
  input: AccountInput,
  options: { now?: number } = {},
): Promise<string> {
  const id = uuidv7();
  const isCard = input.type === "credit_card";
  if (isCard) {
    if (!input.card || !isValidCardCycle(input.card)) {
      throw new DomainError("Confira os dias de fechamento e de vencimento.");
    }
  }
  await db.transaction(async (tx) => {
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(finAccounts)
      .where(eq(finAccounts.userId, userId));
    await tx.insert(finAccounts).values({
      id,
      userId,
      name: input.name.trim(),
      type: input.type,
      color: input.color ?? defaultAccountColor(input.type),
      icon: input.icon ?? ACCOUNT_TYPE_ICONS[input.type],
      // A card starts at 0: what is owed today is an entry on its invoice.
      initialBalanceCents: isCard ? 0 : input.initialBalanceCents,
      // A benefício stays out of the net worth unless the person says so.
      includeInNetWorth: input.includeInNetWorth ?? !isBenefitType(input.type),
      sortOrder: count,
    });
    if (isCard && input.card) {
      await checkPaymentAccount(tx, userId, input.card.paymentAccountId);
      await tx.insert(creditCardDetails).values({
        accountId: id,
        limitCents: input.card.limitCents,
        closingDay: input.card.closingDay,
        dueDay: input.card.dueDay,
        paymentAccountId: input.card.paymentAccountId ?? null,
      });
      const owed = Math.abs(input.initialBalanceCents);
      if (owed > 0) {
        // On the invoice a purchase made today goes to (doc 03 §9.4), so the
        // invoice total, the limit and the balance all come from this entry.
        const ctx = await getUserContext(userId, {
          executor: tx,
          now: options.now,
        });
        const invoiceId = await ensureInvoice(
          tx,
          userId,
          id,
          invoiceFor(ctx.today, input.card),
        );
        await tx.insert(transactions).values({
          userId,
          accountId: id,
          kind: "adjustment",
          status: "paid",
          // The ledger sign: negative is owed.
          amountCents: -owed,
          description: CARD_OPENING_DESCRIPTION,
          occurredOn: ctx.todayIso,
          paidAt: new Date(),
          invoiceId,
        });
      }
    }
  });
  return id;
}

export async function updateAccount(
  userId: string,
  accountId: string,
  input: Partial<
    Pick<
      AccountInput,
      "name" | "type" | "color" | "icon" | "includeInNetWorth" | "card"
    >
  >,
): Promise<void> {
  await db.transaction(async (tx) => {
    const account = await requireAccount(tx, userId, accountId);
    // The type changes only between accounts that are not cards: a card has
    // its own details row, invoices and a balance with the opposite sign.
    const newType =
      input.type !== undefined && input.type !== account.type
        ? input.type
        : null;
    if (
      newType &&
      (account.type === "credit_card" || newType === "credit_card")
    ) {
      throw new DomainError("O tipo de um cartão de crédito não muda.");
    }
    // The icon follows the type unless the person chose another one.
    const icon =
      input.icon ??
      (newType && account.icon === ACCOUNT_TYPE_ICONS[account.type]
        ? ACCOUNT_TYPE_ICONS[newType]
        : undefined);
    const changes = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(newType ? { type: newType } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(icon !== undefined ? { icon } : {}),
      ...(input.includeInNetWorth !== undefined
        ? { includeInNetWorth: input.includeInNetWorth }
        : {}),
    };
    // Only the card's details may change (Drizzle refuses an empty SET).
    if (Object.keys(changes).length > 0) {
      await tx
        .update(finAccounts)
        .set(changes)
        .where(
          and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)),
        );
    }
    if (account.type === "credit_card" && input.card) {
      if (!isValidCardCycle(input.card)) {
        throw new DomainError("Confira os dias de fechamento e de vencimento.");
      }
      const { paymentAccountId } = input.card;
      await checkPaymentAccount(tx, userId, paymentAccountId);
      await tx
        .update(creditCardDetails)
        .set({
          limitCents: input.card.limitCents,
          closingDay: input.card.closingDay,
          dueDay: input.card.dueDay,
          // Left out, the chosen account stays as it is.
          ...(paymentAccountId !== undefined ? { paymentAccountId } : {}),
        })
        .where(eq(creditCardDetails.accountId, accountId));
    }
  });
}

export async function archiveAccount(userId: string, accountId: string) {
  await db
    .update(finAccounts)
    .set({ archivedAt: new Date() })
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)));
}

/**
 * "Ajustar saldo": records the difference between the real balance and the
 * app's balance as an adjustment entry dated today (doc 02 §6.7).
 */
export async function adjustBalance(
  ctx: UserContext,
  accountId: string,
  realBalanceCents: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const account = await requireAccount(tx, ctx.userId, accountId);
    const [current] = await listAccounts(ctx.userId, { executor: tx }).then(
      (items) => items.filter((item) => item.id === account.id),
    );
    const target =
      account.type === "credit_card"
        ? -Math.abs(realBalanceCents)
        : realBalanceCents;
    const difference = target - (current?.balanceCents ?? 0);
    if (difference === 0) return 0;
    // On a card the adjustment goes to the current invoice (doc 03 §9.4).
    const invoiceId = account.cycle
      ? await ensureInvoice(
          tx,
          ctx.userId,
          account.id,
          invoiceFor(ctx.today, account.cycle),
        )
      : null;
    await tx.insert(transactions).values({
      userId: ctx.userId,
      accountId: account.id,
      kind: "adjustment",
      status: "paid",
      amountCents: difference,
      description: "Ajuste de saldo",
      occurredOn: ctx.todayIso,
      paidAt: new Date(),
      invoiceId,
    });
    return difference;
  });
}
