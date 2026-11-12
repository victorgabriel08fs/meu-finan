// "Marcar como acertado" (doc 03 §14): a payment between two members, made
// outside the app, recorded against the plan the person saw. The balance is
// computed again under the group's lock, so two settlements of the same debt
// cannot both pass, and nothing is written to anyone's own statement.
import { and, eq, isNull } from "drizzle-orm";
import { transferBetween } from "@/lib/finance";
import { formatBRL } from "@/lib/format/money";
import { db } from "@/server/db/client";
import { shareMembers, shareSettlements } from "@/server/db/schema";
import type { UserContext } from "../context";
import { DomainError } from "../errors";
import { groupNets } from "./balances";
import { accountOf, GROUP_NOT_FOUND, requireActiveMember } from "./membership";
import { groupHref, notifyMember, type PendingPush } from "./notices";

export const BALANCE_CHANGED =
  "O saldo mudou enquanto você acertava. Confira e tente de novo.";

export type SettleInput = {
  /** From the client: the same settlement sent twice is recorded once. */
  id: string;
  withMemberId: string;
  amountCents: number;
  /**
   * The payment between the two as the person saw it in the plan, from
   * their side: positive, the other pays them.
   */
  expectedCents: number;
  occurredOn: string;
};

/**
 * Records a settlement between the person and another member: the whole
 * debt of the plan between them or part of it, in the direction the balance
 * says. Refused when the balance moved since the screen showed it.
 */
export async function settleUp(
  ctx: UserContext,
  groupId: string,
  input: SettleInput,
): Promise<{ settlementId: string; pending: PendingPush[] }> {
  return db.transaction(async (tx) => {
    const { group, member } = await requireActiveMember(
      tx,
      ctx.userId,
      groupId,
      { lock: true },
    );
    const [done] = await tx
      .select({ id: shareSettlements.id })
      .from(shareSettlements)
      .where(
        and(
          eq(shareSettlements.id, input.id),
          eq(shareSettlements.groupId, groupId),
        ),
      )
      .limit(1);
    if (done) return { settlementId: done.id, pending: [] };

    const [other] = await tx
      .select({
        id: shareMembers.id,
        userId: shareMembers.userId,
        status: shareMembers.status,
      })
      .from(shareMembers)
      .where(
        and(
          eq(shareMembers.id, input.withMemberId),
          eq(shareMembers.groupId, groupId),
        ),
      )
      .limit(1);
    if (
      !other ||
      other.id === member.id ||
      other.status === "invited" ||
      other.status === "declined"
    ) {
      throw new DomainError("Pessoa não encontrada neste grupo.");
    }

    const { plan } = await groupNets(tx, groupId);
    const between = transferBetween(plan, member.id, other.id);
    if (between !== input.expectedCents) throw new DomainError(BALANCE_CHANGED);
    if (between === 0) throw new DomainError("Vocês não têm nada a acertar.");
    if (input.amountCents > Math.abs(between)) {
      throw new DomainError(
        `O acerto passa do que está em aberto (${formatBRL(Math.abs(between))}).`,
      );
    }
    const theyPay = between > 0;
    const [created] = await tx
      .insert(shareSettlements)
      .values({
        id: input.id,
        groupId,
        fromMember: theyPay ? other.id : member.id,
        toMember: theyPay ? member.id : other.id,
        amountCents: input.amountCents,
        occurredOn: input.occurredOn,
        createdByMember: member.id,
      })
      .onConflictDoNothing({ target: shareSettlements.id })
      .returning({ id: shareSettlements.id });
    if (!created) throw new DomainError(BALANCE_CHANGED);

    const pending: PendingPush[] = [];
    if (other.userId && other.status === "active") {
      const actor = await accountOf(tx, ctx.userId);
      const push = await notifyMember(
        tx,
        { userId: other.userId },
        `share_settled:${created.id}`,
        {
          type: "share_settled",
          groupId,
          groupName: group.name,
          actorName: actor.name,
          settlementId: created.id,
          amountCents: input.amountCents,
          // Seen from the other member.
          direction: theyPay ? "you_paid" : "paid_you",
          date: input.occurredOn,
          amounts: true,
        },
        { push: true, url: groupHref(groupId), once: true },
      );
      if (push) pending.push(push);
    }
    return { settlementId: created.id, pending };
  });
}

/** "Desfazer" of a settlement, by whoever recorded it. */
export async function undoSettlement(
  ctx: UserContext,
  settlementId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ groupId: shareSettlements.groupId })
      .from(shareSettlements)
      .where(eq(shareSettlements.id, settlementId))
      .limit(1);
    // An id that exists nowhere reads like one of a group the person is not in.
    if (!found) throw new DomainError(GROUP_NOT_FOUND);
    const { member } = await requireActiveMember(
      tx,
      ctx.userId,
      found.groupId,
      { lock: true },
    );
    const rows = await tx
      .update(shareSettlements)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(shareSettlements.id, settlementId),
          eq(shareSettlements.createdByMember, member.id),
          isNull(shareSettlements.deletedAt),
        ),
      )
      .returning({ id: shareSettlements.id });
    if (rows.length === 0) throw new DomainError("Acerto não encontrado.");
  });
}
