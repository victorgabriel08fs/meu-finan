// Expenses divided in a group (ADR-13, doc 03 §14). An expense is a snapshot
// (description, amount, date) typed in the group or copied from one of the
// creator's own entries; the split always runs on the server
// (src/lib/finance/split.ts). Only the creator's own queries follow
// source_transaction_id, and only to their own rows.
import {
  and,
  asc,
  between,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import {
  type SplitInput,
  type SplitMethod,
  type SplitShare,
  splitExpense,
} from "@/lib/finance";
import { splitErrorLabel } from "@/lib/sharing/labels";
import { EXPENSE_DESCRIPTION_MAX } from "@/lib/sharing/limits";
import { db, type Executor, type Transaction } from "@/server/db/client";
import {
  categories,
  finAccounts,
  sharedExpenseShares,
  sharedExpenses,
  shareGroups,
  shareMembers,
  shareSettlements,
  transactions,
} from "@/server/db/schema";
import type { UserContext } from "../context";
import { DomainError } from "../errors";
import {
  accountOf,
  GROUP_NOT_FOUND,
  type GroupRow,
  groupMembers,
  isUniqueViolation,
  type MemberRow,
  requireActiveMember,
} from "./membership";
import { groupHref, notifyMember, type PendingPush } from "./notices";

export const READ_ONLY_EXPENSE =
  "Esta despesa inclui quem saiu do grupo e não pode mais ser mudada.";
const EXPENSE_NOT_FOUND = "Despesa não encontrada neste grupo.";
const CREATOR_ONLY = "Só quem adicionou a despesa pode mudá-la.";
const ALREADY_SHARED = "Este lançamento já está dividido em um grupo.";

// Reading -------------------------------------------------------------------

export type ExpenseShareView = {
  memberId: string;
  input: number;
  shareCents: number;
};

export type SharedExpenseView = {
  id: string;
  description: string;
  amountCents: number;
  occurredOn: string;
  method: SplitMethod;
  paidByMemberId: string;
  createdByMemberId: string;
  /** ISO instant. */
  createdAt: string;
  shares: ExpenseShareView[];
  /** Someone in it left the group: nobody can change it any more. */
  readOnly: boolean;
  /** For its creator only: the entry it was copied from, when still there. */
  source: {
    accountName: string;
    /** The entry no longer matches the copy ("Desatualizada"). */
    stale: {
      amountCents: number;
      description: string;
      occurredOn: string;
    } | null;
  } | null;
};

export type SettlementView = {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
  occurredOn: string;
  createdByMemberId: string;
};

export type GroupActivity = {
  expenses: SharedExpenseView[];
  settlements: SettlementView[];
};

/**
 * The expenses and settlements of a group between `start` and `end`, newest
 * first, for an active member. The creator of an expense also learns about
 * the entry it came from (their own, joined by user_id).
 */
export async function listGroupActivity(
  ctx: UserContext,
  groupId: string,
  range: { start: string; end: string },
): Promise<GroupActivity> {
  const { member } = await requireActiveMember(db, ctx.userId, groupId);
  const members = await groupMembers(db, groupId);
  const active = new Set(
    members.filter((row) => row.status === "active").map((row) => row.id),
  );

  const rows = await db
    .select({
      id: sharedExpenses.id,
      description: sharedExpenses.description,
      amountCents: sharedExpenses.amountCents,
      occurredOn: sharedExpenses.occurredOn,
      method: sharedExpenses.splitMethod,
      paidByMemberId: sharedExpenses.paidByMember,
      createdByMemberId: sharedExpenses.createdByMember,
      createdAt: sharedExpenses.createdAt,
      sourceId: transactions.id,
      sourceAmount: transactions.amountCents,
      sourceDescription: transactions.description,
      sourceDate: transactions.occurredOn,
      sourceAccount: finAccounts.name,
    })
    .from(sharedExpenses)
    // ADR-13: only the viewer's own entry, and only for expenses they created.
    .leftJoin(
      transactions,
      and(
        eq(transactions.id, sharedExpenses.sourceTransactionId),
        eq(transactions.userId, ctx.userId),
        eq(sharedExpenses.createdByMember, member.id),
        isNull(transactions.deletedAt),
      ),
    )
    .leftJoin(
      finAccounts,
      and(
        eq(finAccounts.id, transactions.accountId),
        eq(finAccounts.userId, ctx.userId),
      ),
    )
    .where(
      and(
        eq(sharedExpenses.groupId, groupId),
        isNull(sharedExpenses.deletedAt),
        between(sharedExpenses.occurredOn, range.start, range.end),
      ),
    )
    .orderBy(desc(sharedExpenses.occurredOn), desc(sharedExpenses.createdAt));

  const shares = await sharesOf(
    db,
    rows.map((row) => row.id),
  );
  const settlements = await db
    .select({
      id: shareSettlements.id,
      fromMemberId: shareSettlements.fromMember,
      toMemberId: shareSettlements.toMember,
      amountCents: shareSettlements.amountCents,
      occurredOn: shareSettlements.occurredOn,
      createdByMemberId: shareSettlements.createdByMember,
    })
    .from(shareSettlements)
    .where(
      and(
        eq(shareSettlements.groupId, groupId),
        isNull(shareSettlements.deletedAt),
        between(shareSettlements.occurredOn, range.start, range.end),
      ),
    )
    .orderBy(
      desc(shareSettlements.occurredOn),
      desc(shareSettlements.createdAt),
    );

  return {
    expenses: rows.map((row) => {
      const parts = shares.get(row.id) ?? [];
      const sourceAmount = row.sourceAmount === null ? null : -row.sourceAmount;
      const stale =
        row.sourceId !== null &&
        (sourceAmount !== row.amountCents ||
          row.sourceDate !== row.occurredOn ||
          row.sourceDescription?.slice(0, EXPENSE_DESCRIPTION_MAX) !==
            row.description);
      return {
        id: row.id,
        description: row.description,
        amountCents: row.amountCents,
        occurredOn: row.occurredOn,
        method: row.method,
        paidByMemberId: row.paidByMemberId,
        createdByMemberId: row.createdByMemberId,
        createdAt: row.createdAt.toISOString(),
        shares: parts,
        readOnly: involvesDeparted(row.paidByMemberId, parts, active),
        source:
          row.sourceId === null
            ? null
            : {
                accountName: row.sourceAccount ?? "",
                stale:
                  stale && sourceAmount !== null && sourceAmount > 0
                    ? {
                        amountCents: sourceAmount,
                        description: row.sourceDescription ?? row.description,
                        occurredOn: row.sourceDate ?? row.occurredOn,
                      }
                    : null,
              },
      };
    }),
    settlements,
  };
}

async function sharesOf(
  executor: Executor,
  expenseIds: readonly string[],
): Promise<Map<string, ExpenseShareView[]>> {
  const result = new Map<string, ExpenseShareView[]>();
  if (expenseIds.length === 0) return result;
  const rows = await executor
    .select({
      expenseId: sharedExpenseShares.expenseId,
      memberId: sharedExpenseShares.memberId,
      input: sharedExpenseShares.input,
      shareCents: sharedExpenseShares.shareCents,
      invitedAt: shareMembers.invitedAt,
    })
    .from(sharedExpenseShares)
    .innerJoin(shareMembers, eq(shareMembers.id, sharedExpenseShares.memberId))
    .where(inArray(sharedExpenseShares.expenseId, [...expenseIds]))
    .orderBy(asc(shareMembers.invitedAt), asc(shareMembers.id));
  for (const { expenseId, invitedAt: _, ...share } of rows) {
    const list = result.get(expenseId) ?? [];
    list.push(share);
    result.set(expenseId, list);
  }
  return result;
}

function involvesDeparted(
  paidBy: string,
  shares: readonly { memberId: string }[],
  active: ReadonlySet<string>,
): boolean {
  return (
    !active.has(paidBy) || shares.some((share) => !active.has(share.memberId))
  );
}

export type MonthSummary = {
  totalCents: number;
  members: { memberId: string; paidCents: number; owedCents: number }[];
};

/** "Total de novembro" and, per member, what they paid and their parts. */
export function groupMonthSummary(
  activity: GroupActivity,
  memberIds: readonly string[],
): MonthSummary {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();
  let totalCents = 0;
  for (const expense of activity.expenses) {
    totalCents += expense.amountCents;
    paid.set(
      expense.paidByMemberId,
      (paid.get(expense.paidByMemberId) ?? 0) + expense.amountCents,
    );
    for (const share of expense.shares) {
      owed.set(
        share.memberId,
        (owed.get(share.memberId) ?? 0) + share.shareCents,
      );
    }
  }
  return {
    totalCents,
    members: memberIds
      .map((memberId) => ({
        memberId,
        paidCents: paid.get(memberId) ?? 0,
        owedCents: owed.get(memberId) ?? 0,
      }))
      .filter((row) => row.paidCents > 0 || row.owedCents > 0),
  };
}

export type ShareableExpense = {
  id: string;
  description: string;
  /** Positive. */
  amountCents: number;
  occurredOn: string;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountName: string;
};

/**
 * The person's own expenses in the period (optionally of a category, its
 * subcategories included) that are in no group yet: what "Do meu extrato"
 * offers.
 */
export async function shareableExpenses(
  ctx: UserContext,
  groupId: string,
  filter: { start: string; end: string; categoryId?: string | null },
): Promise<ShareableExpense[]> {
  await requireActiveMember(db, ctx.userId, groupId);
  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amountCents: transactions.amountCents,
      occurredOn: transactions.occurredOn,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      accountName: finAccounts.name,
    })
    .from(transactions)
    .innerJoin(
      finAccounts,
      and(
        eq(finAccounts.id, transactions.accountId),
        eq(finAccounts.userId, ctx.userId),
      ),
    )
    .leftJoin(
      categories,
      and(
        eq(categories.id, transactions.categoryId),
        eq(categories.userId, ctx.userId),
      ),
    )
    .leftJoin(
      sharedExpenses,
      and(
        eq(sharedExpenses.sourceTransactionId, transactions.id),
        isNull(sharedExpenses.deletedAt),
      ),
    )
    .where(
      and(
        eq(transactions.userId, ctx.userId),
        eq(transactions.kind, "expense"),
        lt(transactions.amountCents, 0),
        isNull(transactions.deletedAt),
        between(transactions.occurredOn, filter.start, filter.end),
        filter.categoryId
          ? or(
              eq(categories.id, filter.categoryId),
              eq(categories.parentId, filter.categoryId),
            )
          : undefined,
        isNull(sharedExpenses.id),
      ),
    )
    .orderBy(desc(transactions.occurredOn), desc(transactions.id))
    .limit(300);
  return rows.map((row) => ({ ...row, amountCents: -row.amountCents }));
}

export type TransactionShareInfo = { groupId: string; groupName: string };

/**
 * For the Extrato: which of the person's entries are divided in a group they
 * are still active in ("Dividida em Casa").
 */
export async function transactionShares(
  userId: string,
  transactionIds: readonly string[],
): Promise<Map<string, TransactionShareInfo>> {
  if (transactionIds.length === 0) return new Map();
  const rows = await db
    .select({
      transactionId: sharedExpenses.sourceTransactionId,
      groupId: sharedExpenses.groupId,
      groupName: shareGroups.name,
    })
    .from(sharedExpenses)
    .innerJoin(shareGroups, eq(shareGroups.id, sharedExpenses.groupId))
    .innerJoin(
      shareMembers,
      and(
        eq(shareMembers.id, sharedExpenses.createdByMember),
        eq(shareMembers.userId, userId),
        eq(shareMembers.status, "active"),
      ),
    )
    .where(
      and(
        inArray(sharedExpenses.sourceTransactionId, [...transactionIds]),
        isNull(sharedExpenses.deletedAt),
      ),
    );
  return new Map(
    rows.flatMap((row) =>
      row.transactionId
        ? [
            [
              row.transactionId,
              { groupId: row.groupId, groupName: row.groupName },
            ] as const,
          ]
        : [],
    ),
  );
}

// Writing -------------------------------------------------------------------

export type SharedExpenseInput = {
  /** From the client (UUIDv7): the same expense sent twice is added once. */
  id: string;
  description: string;
  amountCents: number;
  occurredOn: string;
  paidByMemberId: string;
  method: SplitMethod;
  inputs: SplitInput[];
  /**
   * One of the person's own expenses: its description, amount and date are
   * copied instead of the ones above, and the person is the one who paid.
   */
  transactionId?: string | null;
};

/** Splits on the server, or refuses with the reason (prefixed by the expense). */
function runSplit(
  description: string,
  amountCents: number,
  method: SplitMethod,
  inputs: readonly SplitInput[],
  active: ReadonlySet<string>,
  prefix: boolean,
): SplitShare[] {
  const ids = new Set<string>();
  for (const input of inputs) {
    if (!active.has(input.memberId) || ids.has(input.memberId)) {
      throw new DomainError("Pessoa não encontrada neste grupo.");
    }
    ids.add(input.memberId);
  }
  const result = splitExpense(amountCents, method, inputs);
  if (!result.ok) {
    const reason = splitErrorLabel(result.error);
    throw new DomainError(prefix ? `${description}: ${reason}` : reason);
  }
  return result.shares;
}

async function insertShares(
  tx: Transaction,
  expenseId: string,
  shares: readonly SplitShare[],
): Promise<void> {
  if (shares.length === 0) return;
  await tx.insert(sharedExpenseShares).values(
    shares.map((share) => ({
      expenseId,
      memberId: share.memberId,
      input: share.input,
      shareCents: share.shareCents,
    })),
  );
}

type ActivityDelta = {
  added?: number;
  addedCents?: number;
  changed?: number;
  removed?: number;
  description?: string;
  /** Each recipient's part of what was added, by member id. */
  shareOf?: ReadonlyMap<string, number>;
};

/**
 * One notice a day per actor for each other active member, adding up the
 * counts ("Ana adicionou 3 despesas"); a push only when something was added.
 */
async function notifyActivity(
  tx: Transaction,
  ctx: UserContext,
  group: GroupRow,
  actor: MemberRow,
  members: readonly MemberRow[],
  delta: ActivityDelta,
): Promise<PendingPush[]> {
  const pending: PendingPush[] = [];
  const name = (await accountOf(tx, ctx.userId)).name;
  for (const other of members) {
    if (other.status !== "active" || other.id === actor.id || !other.userId)
      continue;
    const push = await notifyMember(
      tx,
      { userId: other.userId },
      `shared_activity:${group.id}:${actor.id}:${ctx.todayIso}`,
      {
        type: "shared_activity",
        groupId: group.id,
        groupName: group.name,
        actorName: name,
        added: delta.added ?? 0,
        addedCents: delta.addedCents ?? 0,
        myShareCents: delta.shareOf?.get(other.id) ?? 0,
        changed: delta.changed ?? 0,
        removed: delta.removed ?? 0,
        ...(delta.description ? { description: delta.description } : {}),
        amounts: true,
      },
      {
        push: (delta.added ?? 0) > 0,
        url: groupHref(group.id),
        sum: ["added", "addedCents", "myShareCents", "changed", "removed"],
      },
    );
    if (push) pending.push(push);
  }
  return pending;
}

/**
 * Adds expenses to a group: typed ones, or copies of the person's own
 * expenses (each in one group at a time). Who paid and who divides must be
 * active in the group; the split runs here, whatever the client computed.
 */
export async function addSharedExpenses(
  ctx: UserContext,
  groupId: string,
  items: readonly SharedExpenseInput[],
): Promise<{ added: number; pending: PendingPush[] }> {
  try {
    return await db.transaction(async (tx) => {
      const { group, member } = await requireActiveMember(
        tx,
        ctx.userId,
        groupId,
        {
          lock: true,
        },
      );
      const members = await groupMembers(tx, groupId);
      const active = new Set(
        members.filter((row) => row.status === "active").map((row) => row.id),
      );

      const sourceIds = items.flatMap((item) =>
        item.transactionId ? [item.transactionId] : [],
      );
      const sources = new Map(
        sourceIds.length === 0
          ? []
          : (
              await tx
                .select({
                  id: transactions.id,
                  description: transactions.description,
                  amountCents: transactions.amountCents,
                  occurredOn: transactions.occurredOn,
                })
                .from(transactions)
                .where(
                  and(
                    inArray(transactions.id, sourceIds),
                    eq(transactions.userId, ctx.userId),
                    eq(transactions.kind, "expense"),
                    lt(transactions.amountCents, 0),
                    isNull(transactions.deletedAt),
                  ),
                )
            ).map((row) => [row.id, row] as const),
      );

      let added = 0;
      let addedCents = 0;
      let lastDescription: string | undefined;
      const shareOf = new Map<string, number>();
      for (const item of items) {
        let { description, amountCents, occurredOn } = item;
        let paidBy = item.paidByMemberId;
        if (item.transactionId) {
          const source = sources.get(item.transactionId);
          if (!source) throw new DomainError("Lançamento não encontrado.");
          description = source.description.slice(0, EXPENSE_DESCRIPTION_MAX);
          amountCents = -source.amountCents;
          occurredOn = source.occurredOn;
          paidBy = member.id;
        }
        description = description.trim();
        if (!active.has(paidBy))
          throw new DomainError("Pessoa não encontrada neste grupo.");
        const shares = runSplit(
          description,
          amountCents,
          item.method,
          item.inputs,
          active,
          items.length > 1,
        );
        const [created] = await tx
          .insert(sharedExpenses)
          .values({
            id: item.id,
            groupId,
            createdByMember: member.id,
            paidByMember: paidBy,
            description,
            amountCents,
            occurredOn,
            splitMethod: item.method,
            sourceTransactionId: item.transactionId ?? null,
          })
          .onConflictDoNothing({ target: sharedExpenses.id })
          .returning({ id: sharedExpenses.id });
        if (!created) continue; // sent before
        await insertShares(tx, created.id, shares);
        added += 1;
        addedCents += amountCents;
        lastDescription = description;
        for (const share of shares) {
          shareOf.set(
            share.memberId,
            (shareOf.get(share.memberId) ?? 0) + share.shareCents,
          );
        }
      }
      const pending =
        added > 0
          ? await notifyActivity(tx, ctx, group, member, members, {
              added,
              addedCents,
              description: lastDescription,
              shareOf,
            })
          : [];
      return { added, pending };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError(ALREADY_SHARED);
    throw error;
  }
}

/** The expense, locked with its group, for a change by its creator. */
async function lockExpense(
  tx: Transaction,
  ctx: UserContext,
  expenseId: string,
) {
  const [found] = await tx
    .select({ groupId: sharedExpenses.groupId })
    .from(sharedExpenses)
    .where(eq(sharedExpenses.id, expenseId))
    .limit(1);
  // An id that exists nowhere reads like one of a group the person is not in.
  if (!found) throw new DomainError(GROUP_NOT_FOUND);
  const { group, member } = await requireActiveMember(
    tx,
    ctx.userId,
    found.groupId,
    {
      lock: true,
    },
  );
  const [expense] = await tx
    .select({
      id: sharedExpenses.id,
      description: sharedExpenses.description,
      amountCents: sharedExpenses.amountCents,
      occurredOn: sharedExpenses.occurredOn,
      method: sharedExpenses.splitMethod,
      paidBy: sharedExpenses.paidByMember,
      createdBy: sharedExpenses.createdByMember,
      sourceTransactionId: sharedExpenses.sourceTransactionId,
      deletedAt: sharedExpenses.deletedAt,
    })
    .from(sharedExpenses)
    .where(
      and(
        eq(sharedExpenses.id, expenseId),
        eq(sharedExpenses.groupId, group.id),
      ),
    )
    .for("update");
  if (!expense) throw new DomainError(EXPENSE_NOT_FOUND);
  if (expense.createdBy !== member.id) throw new DomainError(CREATOR_ONLY);
  const members = await groupMembers(tx, group.id);
  const active = new Set(
    members.filter((row) => row.status === "active").map((row) => row.id),
  );
  const shares = (await sharesOf(tx, [expense.id])).get(expense.id) ?? [];
  return { group, member, members, active, expense, shares };
}

export type SharedExpenseUpdate = {
  paidByMemberId: string;
  method: SplitMethod;
  inputs: SplitInput[];
  /** Only for expenses typed in the group (a copy follows its entry). */
  description?: string;
  amountCents?: number;
  occurredOn?: string;
};

/** "Editar divisão": who paid, how it is divided and, typed ones, the facts. */
export async function updateSharedExpense(
  ctx: UserContext,
  expenseId: string,
  update: SharedExpenseUpdate,
): Promise<{ pending: PendingPush[] }> {
  return db.transaction(async (tx) => {
    const { group, member, members, active, expense, shares } =
      await lockExpense(tx, ctx, expenseId);
    if (expense.deletedAt) throw new DomainError(EXPENSE_NOT_FOUND);
    if (involvesDeparted(expense.paidBy, shares, active)) {
      throw new DomainError(READ_ONLY_EXPENSE);
    }
    const typed = expense.sourceTransactionId === null;
    const description = typed
      ? (update.description?.trim() ?? expense.description)
      : expense.description;
    const amountCents = typed
      ? (update.amountCents ?? expense.amountCents)
      : expense.amountCents;
    const occurredOn = typed
      ? (update.occurredOn ?? expense.occurredOn)
      : expense.occurredOn;
    const paidBy = typed ? update.paidByMemberId : member.id;
    if (!active.has(paidBy))
      throw new DomainError("Pessoa não encontrada neste grupo.");
    const next = runSplit(
      description,
      amountCents,
      update.method,
      update.inputs,
      active,
      false,
    );
    await tx
      .update(sharedExpenses)
      .set({
        description,
        amountCents,
        occurredOn,
        paidByMember: paidBy,
        splitMethod: update.method,
      })
      .where(eq(sharedExpenses.id, expense.id));
    await tx
      .delete(sharedExpenseShares)
      .where(eq(sharedExpenseShares.expenseId, expense.id));
    await insertShares(tx, expense.id, next);
    const pending = await notifyActivity(tx, ctx, group, member, members, {
      changed: 1,
    });
    return { pending };
  });
}

/** "Tirar do grupo" (its creator); "Desfazer" brings it back. */
export async function deleteSharedExpense(
  ctx: UserContext,
  expenseId: string,
): Promise<{ pending: PendingPush[] }> {
  return db.transaction(async (tx) => {
    const { group, member, members, active, expense, shares } =
      await lockExpense(tx, ctx, expenseId);
    if (expense.deletedAt) return { pending: [] };
    if (involvesDeparted(expense.paidBy, shares, active)) {
      throw new DomainError(READ_ONLY_EXPENSE);
    }
    await tx
      .update(sharedExpenses)
      .set({ deletedAt: new Date() })
      .where(eq(sharedExpenses.id, expense.id));
    const pending = await notifyActivity(tx, ctx, group, member, members, {
      removed: 1,
    });
    return { pending };
  });
}

export async function restoreSharedExpense(
  ctx: UserContext,
  expenseId: string,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const { expense, shares, active } = await lockExpense(tx, ctx, expenseId);
      if (!expense.deletedAt) return;
      if (involvesDeparted(expense.paidBy, shares, active)) {
        throw new DomainError(READ_ONLY_EXPENSE);
      }
      await tx
        .update(sharedExpenses)
        .set({ deletedAt: null })
        .where(eq(sharedExpenses.id, expense.id));
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError(ALREADY_SHARED);
    throw error;
  }
}

/**
 * "Atualizar" of the "Desatualizada" note: copies the entry again (its
 * creator's own, still there) and divides the new amount the same way.
 */
export async function refreshFromSource(
  ctx: UserContext,
  expenseId: string,
): Promise<{ pending: PendingPush[] }> {
  return db.transaction(async (tx) => {
    const { group, member, members, active, expense, shares } =
      await lockExpense(tx, ctx, expenseId);
    if (expense.deletedAt || !expense.sourceTransactionId) {
      throw new DomainError(EXPENSE_NOT_FOUND);
    }
    if (involvesDeparted(expense.paidBy, shares, active)) {
      throw new DomainError(READ_ONLY_EXPENSE);
    }
    const [source] = await tx
      .select({
        description: transactions.description,
        amountCents: transactions.amountCents,
        occurredOn: transactions.occurredOn,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, expense.sourceTransactionId),
          eq(transactions.userId, ctx.userId),
          isNull(transactions.deletedAt),
        ),
      )
      .limit(1);
    if (!source || source.amountCents >= 0) {
      throw new DomainError("O lançamento de origem não existe mais.");
    }
    const amountCents = -source.amountCents;
    const description = source.description
      .slice(0, EXPENSE_DESCRIPTION_MAX)
      .trim();
    const inputs = shares.map((share) => ({
      memberId: share.memberId,
      value: share.input,
    }));
    const result = splitExpense(amountCents, expense.method, inputs);
    if (!result.ok) {
      throw new DomainError(
        `A divisão não fecha com o novo valor: ${splitErrorLabel(result.error)} Edite a divisão.`,
      );
    }
    await tx
      .update(sharedExpenses)
      .set({ description, amountCents, occurredOn: source.occurredOn })
      .where(eq(sharedExpenses.id, expense.id));
    await tx
      .delete(sharedExpenseShares)
      .where(eq(sharedExpenseShares.expenseId, expense.id));
    await insertShares(tx, expense.id, result.shares);
    const pending = await notifyActivity(tx, ctx, group, member, members, {
      changed: 1,
    });
    return { pending };
  });
}
