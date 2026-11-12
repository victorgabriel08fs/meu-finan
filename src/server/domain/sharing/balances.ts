// Balances of groups (doc 03 §14): each member's net over the whole history,
// summed by member in four aggregate queries (paid, owed, sent, received)
// and turned into nets by the finance engine. Callers have already checked
// that the person is an active member of every group asked for.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  type MemberNet,
  type MemberTotals,
  netFromTotals,
  settleUpPlan,
  type Transfer,
} from "@/lib/finance";
import type { Executor } from "@/server/db/client";
import {
  sharedExpenseShares,
  sharedExpenses,
  shareMembers,
  shareSettlements,
} from "@/server/db/schema";

type Sum = { groupId: string; memberId: string; total: number };

const sumOf = (column: AnyPgColumn) =>
  sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

/** Nets of every member with any row, per group; members in the order invited. */
export async function netsForGroups(
  executor: Executor,
  groupIds: readonly string[],
): Promise<Map<string, MemberNet[]>> {
  const result = new Map<string, MemberNet[]>();
  if (groupIds.length === 0) return result;
  const ids = [...groupIds];
  const [members, paid, owed, sent, received] = await Promise.all([
    executor
      .select({ groupId: shareMembers.groupId, memberId: shareMembers.id })
      .from(shareMembers)
      .where(inArray(shareMembers.groupId, ids))
      .orderBy(shareMembers.invitedAt, shareMembers.id),
    executor
      .select({
        groupId: sharedExpenses.groupId,
        memberId: sharedExpenses.paidByMember,
        total: sumOf(sharedExpenses.amountCents),
      })
      .from(sharedExpenses)
      .where(
        and(
          inArray(sharedExpenses.groupId, ids),
          isNull(sharedExpenses.deletedAt),
        ),
      )
      .groupBy(sharedExpenses.groupId, sharedExpenses.paidByMember),
    executor
      .select({
        groupId: sharedExpenses.groupId,
        memberId: sharedExpenseShares.memberId,
        total: sumOf(sharedExpenseShares.shareCents),
      })
      .from(sharedExpenseShares)
      .innerJoin(
        sharedExpenses,
        eq(sharedExpenses.id, sharedExpenseShares.expenseId),
      )
      .where(
        and(
          inArray(sharedExpenses.groupId, ids),
          isNull(sharedExpenses.deletedAt),
        ),
      )
      .groupBy(sharedExpenses.groupId, sharedExpenseShares.memberId),
    executor
      .select({
        groupId: shareSettlements.groupId,
        memberId: shareSettlements.fromMember,
        total: sumOf(shareSettlements.amountCents),
      })
      .from(shareSettlements)
      .where(
        and(
          inArray(shareSettlements.groupId, ids),
          isNull(shareSettlements.deletedAt),
        ),
      )
      .groupBy(shareSettlements.groupId, shareSettlements.fromMember),
    executor
      .select({
        groupId: shareSettlements.groupId,
        memberId: shareSettlements.toMember,
        total: sumOf(shareSettlements.amountCents),
      })
      .from(shareSettlements)
      .where(
        and(
          inArray(shareSettlements.groupId, ids),
          isNull(shareSettlements.deletedAt),
        ),
      )
      .groupBy(shareSettlements.groupId, shareSettlements.toMember),
  ]);
  const index = (rows: readonly Sum[]) =>
    new Map(rows.map((row) => [`${row.groupId}:${row.memberId}`, row.total]));
  const paidBy = index(paid);
  const owedBy = index(owed);
  const sentBy = index(sent);
  const receivedBy = index(received);
  for (const groupId of ids) {
    const totals: MemberTotals[] = members
      .filter((member) => member.groupId === groupId)
      .map(({ memberId }) => {
        const key = `${groupId}:${memberId}`;
        return {
          memberId,
          paidCents: paidBy.get(key) ?? 0,
          owedCents: owedBy.get(key) ?? 0,
          sentCents: sentBy.get(key) ?? 0,
          receivedCents: receivedBy.get(key) ?? 0,
        };
      });
    result.set(groupId, netFromTotals(totals));
  }
  return result;
}

/** One group's nets and the plan to settle them. */
export async function groupNets(
  executor: Executor,
  groupId: string,
): Promise<{ nets: MemberNet[]; plan: Transfer[] }> {
  const nets = (await netsForGroups(executor, [groupId])).get(groupId) ?? [];
  return { nets, plan: settleUpPlan(nets) };
}
