// Accounts (doc 01 §6): balances are always derived from the ledger.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { isValidCardCycle } from "@/lib/finance";
import { db, type Executor } from "@/server/db/client";
import {
  type ColorToken,
  creditCardDetails,
  type FinAccountType,
  finAccounts,
  transactions,
} from "@/server/db/schema";
import type { UserContext } from "./context";
import { DomainError, notFound } from "./errors";

export const ACCOUNT_TYPE_LABELS: Record<FinAccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  investment: "Investimento",
  credit_card: "Cartão de crédito",
  other: "Outra",
};

export const ACCOUNT_TYPE_ICONS: Record<FinAccountType, string> = {
  checking: "landmark",
  savings: "piggy-bank",
  cash: "wallet",
  investment: "trending-up",
  credit_card: "credit-card",
  other: "wallet",
};

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
  card: { limitCents: number; closingDay: number; dueDay: number } | null;
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
  return { id: row.id, name: row.name, type: row.type, cycle };
}

export type AccountInput = {
  name: string;
  type: FinAccountType;
  color?: ColorToken;
  icon?: string;
  /** Current balance in cents (cards: amount owed today as a positive number). */
  initialBalanceCents: number;
  includeInNetWorth?: boolean;
  card?: { limitCents: number; closingDay: number; dueDay: number } | null;
};

export async function createAccount(
  userId: string,
  input: AccountInput,
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
      color: input.color ?? (isCard ? "cat-7" : "cat-1"),
      icon: input.icon ?? ACCOUNT_TYPE_ICONS[input.type],
      // A card balance is what is owed, stored with the ledger sign (negative).
      initialBalanceCents: isCard
        ? -Math.abs(input.initialBalanceCents)
        : input.initialBalanceCents,
      includeInNetWorth: input.includeInNetWorth ?? true,
      sortOrder: count,
    });
    if (isCard && input.card) {
      await tx.insert(creditCardDetails).values({
        accountId: id,
        limitCents: input.card.limitCents,
        closingDay: input.card.closingDay,
        dueDay: input.card.dueDay,
      });
    }
  });
  return id;
}

export async function updateAccount(
  userId: string,
  accountId: string,
  input: Partial<
    Pick<AccountInput, "name" | "color" | "icon" | "includeInNetWorth" | "card">
  >,
): Promise<void> {
  await db.transaction(async (tx) => {
    const account = await requireAccount(tx, userId, accountId);
    await tx
      .update(finAccounts)
      .set({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.includeInNetWorth !== undefined
          ? { includeInNetWorth: input.includeInNetWorth }
          : {}),
      })
      .where(
        and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)),
      );
    if (account.type === "credit_card" && input.card) {
      if (!isValidCardCycle(input.card)) {
        throw new DomainError("Confira os dias de fechamento e de vencimento.");
      }
      await tx
        .update(creditCardDetails)
        .set(input.card)
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
    await tx.insert(transactions).values({
      userId: ctx.userId,
      accountId: account.id,
      kind: "adjustment",
      status: "paid",
      amountCents: difference,
      description: "Ajuste de saldo",
      occurredOn: ctx.todayIso,
      paidAt: new Date(),
    });
    return difference;
  });
}
