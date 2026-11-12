// Groups, members and invites (ADR-13, doc 01 §11.11). An invite goes by
// e-mail and the answer is always the same, account or not: the person
// behind an e-mail only shows up once they accept. Writes lock the group
// (FOR UPDATE) and run in one transaction with the notices and the audit
// entry; pushes go out after the commit (PendingPush).
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  iso,
  localDateIn,
  type MemberNet,
  settleUpPlan,
  transferBetween,
} from "@/lib/finance";
import { formatBRL } from "@/lib/format/money";
import { INVITE_TTL_DAYS, MAX_GROUP_MEMBERS } from "@/lib/sharing/limits";
import { db, type Executor, type Transaction } from "@/server/db/client";
import {
  notifications,
  type ShareDefaultSplit,
  type ShareMemberRole,
  type ShareMemberStatus,
  sharedExpenseShares,
  sharedExpenses,
  shareGroups,
  shareMembers,
  shareSettlements,
  user,
} from "@/server/db/schema";
import { normalizeEmail } from "@/server/security/guards";
import { recordAudit } from "../audit";
import type { UserContext } from "../context";
import { DomainError } from "../errors";
import { groupNets, netsForGroups } from "./balances";
import {
  accountOf,
  GROUP_NOT_FOUND,
  type GroupRow,
  groupMembers,
  isDeletedAccount,
  isUniqueViolation,
  type MemberRow,
  requireActiveMember,
} from "./membership";
import { groupHref, notifyMember, type PendingPush } from "./notices";

const DAY_MS = 24 * 60 * 60 * 1000;
export const INVITE_GONE = "Este convite não vale mais.";
const OWNER_ONLY = "Só quem criou o grupo pode fazer isso.";

// Reading -------------------------------------------------------------------

export type MemberView = {
  id: string;
  name: string;
  /** The e-mail it was invited with. */
  email: string;
  role: ShareMemberRole;
  status: ShareMemberStatus;
  isMe: boolean;
  deleted: boolean;
  /** ISO instant; only for invites. */
  expiresAt: string | null;
  /** The invite's last day, YYYY-MM-DD in the viewer's time zone. */
  expiresOn: string | null;
  /** The invite can still be answered. */
  pending: boolean;
};

export type BalanceTransfer = {
  memberId: string;
  name: string;
  /** Seen from the viewer: positive, they pay the viewer. */
  amountCents: number;
};

export type GroupSummary = {
  id: string;
  name: string;
  myMemberId: string;
  myRole: ShareMemberRole;
  /** Active members other than the viewer, in the order invited. */
  others: { id: string; name: string }[];
  /** The plan's payments that involve the viewer. */
  transfers: BalanceTransfer[];
  pendingInvites: number;
};

export type InviteForMe = {
  memberId: string;
  groupId: string;
  groupName: string;
  inviterName: string;
  inviterEmail: string;
  /** ISO instant. */
  expiresAt: string;
};

function toView(
  member: MemberRow & { deleted: boolean },
  ctx: UserContext,
  now: Date,
): MemberView {
  return {
    id: member.id,
    name: member.displayName,
    email: member.invitedEmail,
    role: member.role,
    status: member.status,
    isMe: member.userId === ctx.userId,
    deleted: member.deleted,
    expiresAt: member.expiresAt?.toISOString() ?? null,
    expiresOn: member.expiresAt
      ? iso(localDateIn(member.expiresAt.getTime(), ctx.timeZone))
      : null,
    pending:
      member.status === "invited" &&
      member.expiresAt !== null &&
      member.expiresAt > now,
  };
}

function transfersFor(
  nets: readonly MemberNet[],
  myMemberId: string,
  names: ReadonlyMap<string, string>,
): BalanceTransfer[] {
  const plan = settleUpPlan(nets);
  const ids = new Set<string>();
  for (const transfer of plan) {
    if (transfer.from === myMemberId) ids.add(transfer.to);
    if (transfer.to === myMemberId) ids.add(transfer.from);
  }
  return [...ids].map((memberId) => ({
    memberId,
    name: names.get(memberId) ?? "",
    amountCents: transferBetween(plan, myMemberId, memberId),
  }));
}

/** The name shown in the history: "(saiu)", "(conta excluída)" once gone. */
function historyName(member: {
  displayName: string;
  status: ShareMemberStatus;
  deleted: boolean;
}): string {
  if (member.deleted) return `${member.displayName} (conta excluída)`;
  if (member.status === "left" || member.status === "removed") {
    return `${member.displayName} (saiu)`;
  }
  return member.displayName;
}

/**
 * The person's groups (active memberships only) with the people in them and
 * what the viewer owes or is owed, plus the invites for them still open.
 */
export async function listMyGroups(
  ctx: UserContext,
  { now = new Date() }: { now?: Date } = {},
): Promise<{ groups: GroupSummary[]; invites: InviteForMe[] }> {
  const mine = await db
    .select({
      groupId: shareMembers.groupId,
      memberId: shareMembers.id,
      role: shareMembers.role,
      name: shareGroups.name,
    })
    .from(shareMembers)
    .innerJoin(shareGroups, eq(shareGroups.id, shareMembers.groupId))
    .where(
      and(
        eq(shareMembers.userId, ctx.userId),
        eq(shareMembers.status, "active"),
      ),
    )
    .orderBy(asc(shareGroups.createdAt), asc(shareGroups.id));

  const [invites, members, nets] = await Promise.all([
    db
      .select({
        memberId: shareMembers.id,
        groupId: shareMembers.groupId,
        groupName: shareGroups.name,
        inviterName: sql<string | null>`${user.name}`,
        inviterEmail: sql<string | null>`${user.email}`,
        expiresAt: shareMembers.expiresAt,
      })
      .from(shareMembers)
      .innerJoin(shareGroups, eq(shareGroups.id, shareMembers.groupId))
      .leftJoin(user, eq(user.id, shareMembers.invitedBy))
      .where(
        and(
          eq(shareMembers.userId, ctx.userId),
          eq(shareMembers.status, "invited"),
          gt(shareMembers.expiresAt, now),
        ),
      )
      .orderBy(desc(shareMembers.invitedAt)),
    mine.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: shareMembers.id,
            groupId: shareMembers.groupId,
            userId: shareMembers.userId,
            status: shareMembers.status,
            displayName: shareMembers.displayName,
            expiresAt: shareMembers.expiresAt,
          })
          .from(shareMembers)
          .where(
            inArray(
              shareMembers.groupId,
              mine.map((row) => row.groupId),
            ),
          )
          .orderBy(asc(shareMembers.invitedAt), asc(shareMembers.id)),
    netsForGroups(
      db,
      mine.map((row) => row.groupId),
    ),
  ]);

  const groups = mine.map((row): GroupSummary => {
    const people = members.filter((member) => member.groupId === row.groupId);
    const names = new Map(
      people.map((member) => [
        member.id,
        historyName({ ...member, deleted: isDeletedAccount(member) }),
      ]),
    );
    return {
      id: row.groupId,
      name: row.name,
      myMemberId: row.memberId,
      myRole: row.role,
      others: people
        .filter(
          (member) => member.status === "active" && member.id !== row.memberId,
        )
        .map((member) => ({ id: member.id, name: member.displayName })),
      transfers: transfersFor(nets.get(row.groupId) ?? [], row.memberId, names),
      pendingInvites: people.filter(
        (member) =>
          member.status === "invited" &&
          member.expiresAt !== null &&
          member.expiresAt > now,
      ).length,
    };
  });

  return {
    groups,
    invites: invites.map((row) => ({
      memberId: row.memberId,
      groupId: row.groupId,
      groupName: row.groupName,
      inviterName: row.inviterName ?? "Alguém",
      inviterEmail: row.inviterEmail ?? "",
      expiresAt: (row.expiresAt ?? now).toISOString(),
    })),
  };
}

/** How many groups and open invites the person has (Ajustes, the Início). */
export async function sharingCounts(
  userId: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<{ groups: number; invites: number }> {
  const [row] = await db
    .select({
      groups:
        sql<number>`count(*) filter (where ${shareMembers.status} = 'active')`.mapWith(
          Number,
        ),
      invites:
        sql<number>`count(*) filter (where ${shareMembers.status} = 'invited' and ${shareMembers.expiresAt} > ${now.toISOString()}::timestamptz)`.mapWith(
          Number,
        ),
    })
    .from(shareMembers)
    .where(eq(shareMembers.userId, userId));
  return { groups: row?.groups ?? 0, invites: row?.invites ?? 0 };
}

export type GroupDetail = {
  id: string;
  name: string;
  defaultSplit: ShareDefaultSplit | null;
  me: MemberView;
  members: MemberView[];
  /** Name for the history ("Bruno (saiu)"), by member id. */
  names: Record<string, string>;
  /** Every member's net over the whole history. */
  nets: MemberNet[];
  /** The whole plan to settle the group. */
  plan: { from: string; to: string; amountCents: number }[];
  /** The plan's payments that involve the viewer. */
  transfers: BalanceTransfer[];
};

/** One group, for an active member; "Grupo não encontrado." for anyone else. */
export async function getGroup(
  ctx: UserContext,
  groupId: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<GroupDetail> {
  const { group, member } = await requireActiveMember(db, ctx.userId, groupId);
  const [members, balance] = await Promise.all([
    groupMembers(db, groupId),
    groupNets(db, groupId),
  ]);
  const views = members.map((row) => toView(row, ctx, now));
  const names = new Map(members.map((row) => [row.id, historyName(row)]));
  const me = views.find((view) => view.id === member.id);
  if (!me) throw new DomainError(GROUP_NOT_FOUND);
  return {
    id: group.id,
    name: group.name,
    defaultSplit: group.defaultSplit,
    me,
    members: views,
    names: Object.fromEntries(names),
    nets: balance.nets,
    plan: balance.plan,
    transfers: transfersFor(balance.nets, member.id, names),
  };
}

// Writing -------------------------------------------------------------------

type Actor = { id: string; name: string; email: string };

async function lockGroup(tx: Transaction, groupId: string): Promise<GroupRow> {
  const [group] = await tx
    .select({
      id: shareGroups.id,
      name: shareGroups.name,
      defaultSplit: shareGroups.defaultSplit,
    })
    .from(shareGroups)
    .where(eq(shareGroups.id, groupId))
    .for("update");
  if (!group) throw new DomainError(GROUP_NOT_FOUND);
  return group;
}

/** Active members other than `exceptMemberId`, with an account. */
async function activeAccounts(
  tx: Transaction,
  groupId: string,
  exceptMemberId: string,
): Promise<{ memberId: string; userId: string }[]> {
  const rows = await tx
    .select({ memberId: shareMembers.id, userId: shareMembers.userId })
    .from(shareMembers)
    .where(
      and(
        eq(shareMembers.groupId, groupId),
        eq(shareMembers.status, "active"),
        ne(shareMembers.id, exceptMemberId),
      ),
    );
  return rows.flatMap((row) =>
    row.userId ? [{ memberId: row.memberId, userId: row.userId }] : [],
  );
}

/**
 * Invites each e-mail to a locked group: counts the active members and the
 * open invites against the limit, refuses the person's own e-mail and one
 * already in the group or invited, and gives a new chance to an expired,
 * declined or departed row. The answer never says whether an e-mail has an
 * account: only the person behind it gets the notice.
 */
async function inviteEmails(
  tx: Transaction,
  group: GroupRow,
  actor: Actor,
  rawEmails: readonly string[],
  now: Date,
): Promise<PendingPush[]> {
  const emails = [...new Set(rawEmails.map(normalizeEmail))].filter(Boolean);
  if (emails.length === 0) return [];
  if (emails.includes(normalizeEmail(actor.email))) {
    throw new DomainError("Esse é o seu e-mail. Convide outra pessoa.");
  }
  const [count] = await tx
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(shareMembers)
    .where(
      and(
        eq(shareMembers.groupId, group.id),
        or(
          eq(shareMembers.status, "active"),
          and(
            eq(shareMembers.status, "invited"),
            gt(shareMembers.expiresAt, now),
          ),
        ),
      ),
    );
  if ((count?.total ?? 0) + emails.length > MAX_GROUP_MEMBERS) {
    throw new DomainError(
      `Um grupo tem até ${MAX_GROUP_MEMBERS} pessoas, contando os convites pendentes.`,
    );
  }

  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);
  const taken = `Esse e-mail já foi convidado para ${group.name}.`;
  const pending: PendingPush[] = [];
  for (const email of emails) {
    const [account] = await tx
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(
        and(
          sql`lower(${user.email}) = ${email}`,
          or(isNull(user.banned), eq(user.banned, false)),
        ),
      )
      .limit(1);
    // A row to give a new chance: the account's own, or an invite to the
    // e-mail from before it had an account.
    const candidates = await tx
      .select({
        id: shareMembers.id,
        userId: shareMembers.userId,
        status: shareMembers.status,
        expiresAt: shareMembers.expiresAt,
      })
      .from(shareMembers)
      .where(
        and(
          eq(shareMembers.groupId, group.id),
          or(
            account ? eq(shareMembers.userId, account.id) : sql`false`,
            and(
              eq(shareMembers.invitedEmail, email),
              isNull(shareMembers.userId),
              eq(shareMembers.status, "invited"),
            ),
          ),
        ),
      );
    const existing =
      candidates.find((row) => account && row.userId === account.id) ??
      candidates[0];
    if (existing?.status === "active") {
      throw new DomainError(`Esse e-mail já está no grupo ${group.name}.`);
    }
    if (
      existing?.status === "invited" &&
      existing.expiresAt &&
      existing.expiresAt > now
    ) {
      throw new DomainError(taken);
    }
    const values = {
      userId: account?.id ?? null,
      invitedEmail: email,
      // Never the account's name: any member would learn the e-mail has one.
      displayName: email,
      role: "member" as const,
      status: "invited" as const,
      invitedBy: actor.id,
      invitedAt: now,
      expiresAt,
      respondedAt: null,
      leftAt: null,
    };
    let memberId: string;
    if (existing) {
      await tx
        .update(shareMembers)
        .set(values)
        .where(eq(shareMembers.id, existing.id));
      memberId = existing.id;
    } else {
      const [created] = await tx
        .insert(shareMembers)
        .values({ groupId: group.id, ...values })
        .returning({ id: shareMembers.id });
      if (!created) throw new DomainError(taken);
      memberId = created.id;
    }

    if (account) {
      const push = await notifyMember(
        tx,
        { userId: account.id },
        `share_invite:${memberId}`,
        {
          type: "share_invite",
          groupId: group.id,
          memberId,
          groupName: group.name,
          inviterName: actor.name,
          inviterEmail: actor.email,
          amounts: false,
        },
        { push: true, url: "/compartilhado" },
      );
      if (push) pending.push(push);
    }
    await recordAudit(tx, {
      action: "share.invited",
      actor,
      target: account
        ? { id: account.id, name: account.name, email: account.email }
        : null,
      metadata: account ? {} : { unresolved: true },
    });
  }
  return pending;
}

/** Runs a write and turns a repeated e-mail (23505) into its message. */
async function withInviteErrors<T>(
  groupName: () => string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(
        `Esse e-mail já foi convidado para ${groupName()}.`,
      );
    }
    throw error;
  }
}

/**
 * Creates a group with the person as its owner and invites the e-mails.
 * The id comes from the client: sending it again changes nothing.
 */
export async function createGroup(
  ctx: UserContext,
  input: { id: string; name: string; emails: readonly string[] },
  { now = new Date() }: { now?: Date } = {},
): Promise<{ groupId: string; pending: PendingPush[] }> {
  const name = input.name.trim();
  return withInviteErrors(
    () => name,
    () =>
      db.transaction(async (tx) => {
        const actor = await accountOf(tx, ctx.userId);
        const [created] = await tx
          .insert(shareGroups)
          .values({ id: input.id, name, createdBy: ctx.userId })
          .onConflictDoNothing({ target: shareGroups.id })
          .returning({ id: shareGroups.id });
        if (!created) {
          // Sent again: only its owner gets an answer.
          await requireActiveMember(tx, ctx.userId, input.id);
          return { groupId: input.id, pending: [] };
        }
        await tx.insert(shareMembers).values({
          groupId: input.id,
          userId: ctx.userId,
          invitedEmail: normalizeEmail(actor.email),
          displayName: actor.name,
          role: "owner",
          status: "active",
          invitedBy: ctx.userId,
          invitedAt: now,
          respondedAt: now,
        });
        const group = await lockGroup(tx, input.id);
        const pending = await inviteEmails(tx, group, actor, input.emails, now);
        return { groupId: input.id, pending };
      }),
  );
}

/** Invites more people to a group the person is active in. */
export async function inviteToGroup(
  ctx: UserContext,
  groupId: string,
  emails: readonly string[],
  { now = new Date() }: { now?: Date } = {},
): Promise<{ pending: PendingPush[] }> {
  let groupName = "";
  return withInviteErrors(
    () => groupName,
    () =>
      db.transaction(async (tx) => {
        const { group } = await requireActiveMember(tx, ctx.userId, groupId, {
          lock: true,
        });
        groupName = group.name;
        const actor = await accountOf(tx, ctx.userId);
        return { pending: await inviteEmails(tx, group, actor, emails, now) };
      }),
  );
}

/**
 * Accepts or declines an invite of the person's own, still open. Accepting
 * counts the group's active members again under the group's lock; the
 * invite's notice is marked as read either way.
 */
export async function respondToInvite(
  ctx: UserContext,
  memberId: string,
  answer: "accept" | "decline",
  { now = new Date() }: { now?: Date } = {},
): Promise<{ groupId: string; groupName: string; pending: PendingPush[] }> {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ groupId: shareMembers.groupId })
      .from(shareMembers)
      .where(
        and(eq(shareMembers.id, memberId), eq(shareMembers.userId, ctx.userId)),
      )
      .limit(1);
    if (!found) throw new DomainError(INVITE_GONE);
    const group = await lockGroup(tx, found.groupId);
    const [invite] = await tx
      .select({ id: shareMembers.id, invitedBy: shareMembers.invitedBy })
      .from(shareMembers)
      .where(
        and(
          eq(shareMembers.id, memberId),
          eq(shareMembers.userId, ctx.userId),
          eq(shareMembers.status, "invited"),
          gt(shareMembers.expiresAt, now),
        ),
      )
      .for("update");
    if (!invite) throw new DomainError(INVITE_GONE);
    const me = await accountOf(tx, ctx.userId);

    if (answer === "accept") {
      const [count] = await tx
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(shareMembers)
        .where(
          and(
            eq(shareMembers.groupId, group.id),
            eq(shareMembers.status, "active"),
          ),
        );
      if ((count?.total ?? 0) >= MAX_GROUP_MEMBERS) {
        throw new DomainError(
          `O grupo ${group.name} já tem ${MAX_GROUP_MEMBERS} pessoas.`,
        );
      }
    }
    await tx
      .update(shareMembers)
      .set(
        answer === "accept"
          ? { status: "active", respondedAt: now, displayName: me.name }
          : { status: "declined", respondedAt: now },
      )
      .where(eq(shareMembers.id, memberId));
    await tx
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.userId, ctx.userId),
          eq(notifications.dedupeKey, `share_invite:${memberId}`),
          isNull(notifications.readAt),
        ),
      );

    const pending: PendingPush[] = [];
    if (answer === "accept") {
      for (const other of await activeAccounts(tx, group.id, memberId)) {
        const push = await notifyMember(
          tx,
          other,
          `share_joined:${memberId}`,
          {
            type: "share_joined",
            groupId: group.id,
            groupName: group.name,
            memberName: me.name,
            amounts: false,
          },
          { push: true, url: groupHref(group.id) },
        );
        if (push) pending.push(push);
      }
    } else if (invite.invitedBy) {
      const [inviter] = await tx
        .select({ id: shareMembers.id })
        .from(shareMembers)
        .where(
          and(
            eq(shareMembers.groupId, group.id),
            eq(shareMembers.userId, invite.invitedBy),
            eq(shareMembers.status, "active"),
          ),
        )
        .limit(1);
      if (inviter) {
        await notifyMember(
          tx,
          { userId: invite.invitedBy },
          `share_declined:${memberId}`,
          {
            type: "share_declined",
            groupId: group.id,
            groupName: group.name,
            memberName: me.name,
            amounts: false,
          },
          { push: false, url: groupHref(group.id) },
        );
      }
    }
    const inviter = invite.invitedBy
      ? await tx
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, invite.invitedBy))
          .limit(1)
      : [];
    await recordAudit(tx, {
      action: answer === "accept" ? "share.accepted" : "share.declined",
      actor: me,
      target: inviter[0] ?? null,
    });
    return { groupId: group.id, groupName: group.name, pending };
  });
}

/**
 * Gives the group to its longest-standing active member when its owner
 * leaves, and deletes it when nobody active is left. True when deleted.
 */
async function afterDeparture(
  tx: Executor,
  groupId: string,
  departed: { id: string; role: ShareMemberRole },
): Promise<boolean> {
  const [heir] = await tx
    .select({ id: shareMembers.id })
    .from(shareMembers)
    .where(
      and(
        eq(shareMembers.groupId, groupId),
        eq(shareMembers.status, "active"),
        ne(shareMembers.id, departed.id),
      ),
    )
    .orderBy(
      asc(shareMembers.respondedAt),
      asc(shareMembers.invitedAt),
      asc(shareMembers.id),
    )
    .limit(1);
  if (!heir) {
    await tx.delete(shareGroups).where(eq(shareGroups.id, groupId));
    return true;
  }
  if (departed.role === "owner") {
    await tx
      .update(shareMembers)
      .set({ role: "member" })
      .where(eq(shareMembers.id, departed.id));
    await tx
      .update(shareMembers)
      .set({ role: "owner" })
      .where(eq(shareMembers.id, heir.id));
  }
  return false;
}

/**
 * Leaves a group at once, open balance or not: the history stays for the
 * others with "(saiu)". The last one out deletes the group.
 */
export async function leaveGroup(
  ctx: UserContext,
  groupId: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<{ deleted: boolean; pending: PendingPush[] }> {
  return db.transaction(async (tx) => {
    const { group, member } = await requireActiveMember(
      tx,
      ctx.userId,
      groupId,
      { lock: true },
    );
    const me = await accountOf(tx, ctx.userId);
    await tx
      .update(shareMembers)
      .set({ status: "left", leftAt: now })
      .where(eq(shareMembers.id, member.id));
    const others = await activeAccounts(tx, groupId, member.id);
    const deleted = await afterDeparture(tx, groupId, member);
    if (!deleted) {
      for (const other of others) {
        await notifyMember(
          tx,
          other,
          `share_left:${member.id}`,
          {
            type: "share_left",
            groupId,
            groupName: group.name,
            memberName: me.name,
            amounts: false,
          },
          { push: false, url: groupHref(groupId) },
        );
      }
    }
    await recordAudit(tx, { action: "share.left", actor: me });
    return { deleted, pending: [] };
  });
}

/** Whether any expense, part or settlement points at the member. */
async function hasHistory(tx: Executor, memberId: string): Promise<boolean> {
  const [paid, part, settled] = await Promise.all([
    tx
      .select({ id: sharedExpenses.id })
      .from(sharedExpenses)
      .where(
        or(
          eq(sharedExpenses.paidByMember, memberId),
          eq(sharedExpenses.createdByMember, memberId),
        ),
      )
      .limit(1),
    tx
      .select({ id: sharedExpenseShares.expenseId })
      .from(sharedExpenseShares)
      .where(eq(sharedExpenseShares.memberId, memberId))
      .limit(1),
    tx
      .select({ id: shareSettlements.id })
      .from(shareSettlements)
      .where(
        or(
          eq(shareSettlements.fromMember, memberId),
          eq(shareSettlements.toMember, memberId),
          eq(shareSettlements.createdByMember, memberId),
        ),
      )
      .limit(1),
  ]);
  return paid.length + part.length + settled.length > 0;
}

/**
 * The owner takes someone out of the group (access ends at once) or cancels
 * an invite. A cancelled invite leaves no trace, unless the row carries the
 * history of someone who was in the group before.
 */
export async function removeMember(
  ctx: UserContext,
  groupId: string,
  memberId: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<{ pending: PendingPush[] }> {
  return db.transaction(async (tx) => {
    const { group, member } = await requireActiveMember(
      tx,
      ctx.userId,
      groupId,
      { lock: true },
    );
    if (member.role !== "owner") throw new DomainError(OWNER_ONLY);
    const [target] = await tx
      .select({
        id: shareMembers.id,
        userId: shareMembers.userId,
        status: shareMembers.status,
        displayName: shareMembers.displayName,
        invitedEmail: shareMembers.invitedEmail,
      })
      .from(shareMembers)
      .where(
        and(eq(shareMembers.id, memberId), eq(shareMembers.groupId, groupId)),
      )
      .for("update");
    if (!target || target.id === member.id) {
      throw new DomainError("Pessoa não encontrada neste grupo.");
    }
    const actor = await accountOf(tx, ctx.userId);
    if (target.status === "invited") {
      if (await hasHistory(tx, target.id)) {
        await tx
          .update(shareMembers)
          .set({ status: "left", expiresAt: null })
          .where(eq(shareMembers.id, target.id));
      } else {
        await tx.delete(shareMembers).where(eq(shareMembers.id, target.id));
      }
      return { pending: [] };
    }
    if (target.status !== "active") {
      throw new DomainError("Essa pessoa já não está no grupo.");
    }
    await tx
      .update(shareMembers)
      .set({ status: "removed", leftAt: now })
      .where(eq(shareMembers.id, target.id));
    const pending: PendingPush[] = [];
    let auditTarget: Actor | null = null;
    if (target.userId) {
      const push = await notifyMember(
        tx,
        { userId: target.userId },
        `share_removed:${target.id}`,
        {
          type: "share_removed",
          groupId,
          groupName: group.name,
          actorName: actor.name,
          amounts: false,
        },
        { push: true, url: "/compartilhado" },
      );
      if (push) pending.push(push);
      auditTarget = await accountOf(tx, target.userId);
    }
    await recordAudit(tx, {
      action: "share.removed",
      actor,
      target: auditTarget,
    });
    return { pending };
  });
}

/** Renames the group (its owner). */
export async function renameGroup(
  ctx: UserContext,
  groupId: string,
  name: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { member } = await requireActiveMember(tx, ctx.userId, groupId, {
      lock: true,
    });
    if (member.role !== "owner") throw new DomainError(OWNER_ONLY);
    await tx
      .update(shareGroups)
      .set({ name: name.trim() })
      .where(eq(shareGroups.id, groupId));
  });
}

/** The way new expenses are divided (any active member); null clears it. */
export async function setDefaultSplit(
  ctx: UserContext,
  groupId: string,
  split: ShareDefaultSplit | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await requireActiveMember(tx, ctx.userId, groupId, { lock: true });
    if (split) {
      const members = await groupMembers(tx, groupId);
      const active = new Set(
        members.filter((row) => row.status === "active").map((row) => row.id),
      );
      for (const id of Object.keys(split.inputs)) {
        if (!active.has(id))
          throw new DomainError("Pessoa não encontrada neste grupo.");
      }
    }
    await tx
      .update(shareGroups)
      .set({ defaultSplit: split })
      .where(eq(shareGroups.id, groupId));
  });
}

// Accounts deleted by an administrator -------------------------------------

/**
 * Before an account is deleted (inside the same transaction): its open
 * invites go away, and where it was active it counts as gone ("Bruno (conta
 * excluída)", once user_id turns null), handing the group on or deleting it
 * when nobody active is left. The history and the balances stay.
 */
export async function detachDeletedAccount(
  tx: Executor,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const invites = await tx
    .select({ id: shareMembers.id })
    .from(shareMembers)
    .where(
      and(eq(shareMembers.userId, userId), eq(shareMembers.status, "invited")),
    );
  for (const invite of invites) {
    // A new invite to someone who was in the group keeps their history.
    if (await hasHistory(tx, invite.id)) {
      await tx
        .update(shareMembers)
        .set({ status: "left", expiresAt: null })
        .where(eq(shareMembers.id, invite.id));
    } else {
      await tx.delete(shareMembers).where(eq(shareMembers.id, invite.id));
    }
  }
  const active = await tx
    .select({
      id: shareMembers.id,
      groupId: shareMembers.groupId,
      role: shareMembers.role,
    })
    .from(shareMembers)
    .where(
      and(eq(shareMembers.userId, userId), eq(shareMembers.status, "active")),
    );
  for (const member of active) {
    await tx
      .select({ id: shareGroups.id })
      .from(shareGroups)
      .where(eq(shareGroups.id, member.groupId))
      .for("update");
    await tx
      .update(shareMembers)
      .set({ status: "left", leftAt: now })
      .where(eq(shareMembers.id, member.id));
    await afterDeparture(tx, member.groupId, member);
  }
}

/** For "Sair de Casa?": what is still open for the person. */
export function openBalanceText(
  transfers: readonly BalanceTransfer[],
): string | null {
  const total = transfers.reduce(
    (sum, item) => sum + Math.abs(item.amountCents),
    0,
  );
  return total > 0 ? formatBRL(total) : null;
}

/**
 * For the bell: the groups among `groupIds` the person is still active in,
 * and the invites among `inviteIds` still theirs to answer.
 */
export async function noticeStates(
  userId: string,
  groupIds: readonly string[],
  inviteIds: readonly string[],
  { now = new Date() }: { now?: Date } = {},
): Promise<{ activeGroups: Set<string>; openInvites: Set<string> }> {
  if (groupIds.length === 0 && inviteIds.length === 0) {
    return { activeGroups: new Set(), openInvites: new Set() };
  }
  const rows = await db
    .select({
      id: shareMembers.id,
      groupId: shareMembers.groupId,
      status: shareMembers.status,
      expiresAt: shareMembers.expiresAt,
    })
    .from(shareMembers)
    .where(
      and(
        eq(shareMembers.userId, userId),
        or(
          groupIds.length > 0
            ? inArray(shareMembers.groupId, [...groupIds])
            : sql`false`,
          inviteIds.length > 0
            ? inArray(shareMembers.id, [...inviteIds])
            : sql`false`,
        ),
      ),
    );
  return {
    activeGroups: new Set(
      rows.filter((row) => row.status === "active").map((row) => row.groupId),
    ),
    openInvites: new Set(
      rows
        .filter(
          (row) =>
            row.status === "invited" &&
            row.expiresAt !== null &&
            row.expiresAt > now,
        )
        .map((row) => row.id),
    ),
  };
}

export type ShareTarget = {
  id: string;
  name: string;
  myMemberId: string;
  /** Active members, the person first marked `isMe`, in the order invited. */
  members: { id: string; name: string; isMe: boolean }[];
  defaultSplit: ShareDefaultSplit | null;
};

/** The groups an entry of the Extrato can be divided in ("Dividir"). */
export async function listShareTargets(userId: string): Promise<ShareTarget[]> {
  const mine = await db
    .select({
      groupId: shareMembers.groupId,
      memberId: shareMembers.id,
      name: shareGroups.name,
      defaultSplit: shareGroups.defaultSplit,
    })
    .from(shareMembers)
    .innerJoin(shareGroups, eq(shareGroups.id, shareMembers.groupId))
    .where(
      and(eq(shareMembers.userId, userId), eq(shareMembers.status, "active")),
    )
    .orderBy(asc(shareGroups.createdAt), asc(shareGroups.id));
  if (mine.length === 0) return [];
  const members = await db
    .select({
      id: shareMembers.id,
      groupId: shareMembers.groupId,
      userId: shareMembers.userId,
      name: shareMembers.displayName,
    })
    .from(shareMembers)
    .where(
      and(
        inArray(
          shareMembers.groupId,
          mine.map((row) => row.groupId),
        ),
        eq(shareMembers.status, "active"),
      ),
    )
    .orderBy(asc(shareMembers.invitedAt), asc(shareMembers.id));
  return mine.map((row) => ({
    id: row.groupId,
    name: row.name,
    myMemberId: row.memberId,
    defaultSplit: row.defaultSplit,
    members: members
      .filter((member) => member.groupId === row.groupId)
      .map((member) => ({
        id: member.id,
        name: member.name,
        isMe: member.userId === userId,
      })),
  }));
}
