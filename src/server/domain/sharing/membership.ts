// Who belongs to a group (ADR-13): every shared read and write goes through
// `requireActiveMember` in the same transaction, and every id received
// (member, expense, settlement) has to belong to that group. To anyone who is
// not an active member a group answers exactly like an id that does not
// exist.
import { and, asc, eq, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import {
  type ShareDefaultSplit,
  type ShareMemberRole,
  type ShareMemberStatus,
  shareGroups,
  shareMembers,
  user,
} from "@/server/db/schema";
import { DomainError } from "../errors";

export const GROUP_NOT_FOUND = "Grupo não encontrado.";

export type GroupRow = {
  id: string;
  name: string;
  defaultSplit: ShareDefaultSplit | null;
};

export type MemberRow = {
  id: string;
  groupId: string;
  userId: string | null;
  invitedEmail: string;
  displayName: string;
  role: ShareMemberRole;
  status: ShareMemberStatus;
  invitedBy: string | null;
  invitedAt: Date;
  expiresAt: Date | null;
  respondedAt: Date | null;
  leftAt: Date | null;
};

const memberColumns = {
  id: shareMembers.id,
  groupId: shareMembers.groupId,
  userId: shareMembers.userId,
  invitedEmail: shareMembers.invitedEmail,
  displayName: shareMembers.displayName,
  role: shareMembers.role,
  status: shareMembers.status,
  invitedBy: shareMembers.invitedBy,
  invitedAt: shareMembers.invitedAt,
  expiresAt: shareMembers.expiresAt,
  respondedAt: shareMembers.respondedAt,
  leftAt: shareMembers.leftAt,
};

/**
 * The group and the person's active membership in it. With `lock`, the group
 * row is locked first (FOR UPDATE): every write to a group takes this lock,
 * so writes to the same group run one after the other. "Grupo não
 * encontrado." for a group that does not exist and for anyone who is not an
 * active member of it.
 */
export async function requireActiveMember(
  executor: Executor,
  userId: string,
  groupId: string,
  { lock = false }: { lock?: boolean } = {},
): Promise<{ group: GroupRow; member: MemberRow }> {
  const groupQuery = executor
    .select({
      id: shareGroups.id,
      name: shareGroups.name,
      defaultSplit: shareGroups.defaultSplit,
    })
    .from(shareGroups)
    .where(eq(shareGroups.id, groupId));
  const [group] = lock ? await groupQuery.for("update") : await groupQuery;
  if (!group) throw new DomainError(GROUP_NOT_FOUND);
  const [member] = await executor
    .select(memberColumns)
    .from(shareMembers)
    .where(
      and(
        eq(shareMembers.groupId, groupId),
        eq(shareMembers.userId, userId),
        eq(shareMembers.status, "active"),
      ),
    )
    .limit(1);
  if (!member) throw new DomainError(GROUP_NOT_FOUND);
  return { group, member };
}

/**
 * Every member of the group, whatever their status, in the order they were
 * invited (the order the split gives leftover cents in). `deleted`: the
 * account behind a member who had joined was deleted.
 */
export async function groupMembers(
  executor: Executor,
  groupId: string,
): Promise<(MemberRow & { deleted: boolean })[]> {
  const rows = await executor
    .select(memberColumns)
    .from(shareMembers)
    .where(eq(shareMembers.groupId, groupId))
    .orderBy(asc(shareMembers.invitedAt), asc(shareMembers.id));
  return rows.map((row) => ({ ...row, deleted: isDeletedAccount(row) }));
}

/** A member who had joined (left, removed) and whose account no longer exists. */
export function isDeletedAccount(member: {
  userId: string | null;
  status: ShareMemberStatus;
}): boolean {
  return (
    member.userId === null &&
    member.status !== "invited" &&
    member.status !== "declined"
  );
}

/** The name and e-mail of an account, read inside the caller's transaction. */
export async function accountOf(
  executor: Executor,
  userId: string,
): Promise<{ id: string; name: string; email: string }> {
  const [row] = await executor
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) throw new DomainError(GROUP_NOT_FOUND);
  return row;
}

/** Postgres' unique violation (23505), from either driver. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (value: unknown) =>
    typeof value === "object" && value !== null && "code" in value
      ? (value as { code: unknown }).code
      : undefined;
  return (
    code(error) === "23505" ||
    code((error as { cause?: unknown } | null)?.cause) === "23505"
  );
}

/** The ids of the group's active members. */
export function activeIds(members: readonly MemberRow[]): Set<string> {
  return new Set(
    members
      .filter((member) => member.status === "active")
      .map((member) => member.id),
  );
}

/** `now()` as the database sees it, for comparisons with expires_at. */
export const dbNow = sql`now()`;
