// User management for administrators (doc 01 §11.9). An administrator manages
// accounts, never another person's money: nothing here reads or writes the
// financial tables of someone else, except deleting an account with all its
// data. Every write runs in one transaction that locks the accounts involved
// (and the administrators), re-checks that the actor is still an active
// administrator, asks the guards and records the audit entry.
import { generateRandomString } from "better-auth/crypto";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  max,
  or,
  sql,
} from "drizzle-orm";
import { type AccountAction, accountActionBlocker } from "@/lib/admin/guards";
import { hasAdminRole, toUserRole, type UserRole } from "@/lib/admin/roles";
import { type AccountStatus, accountStatus } from "@/lib/admin/status";
import { db, type Transaction } from "@/server/db/client";
import {
  type AccessLinkPurpose,
  accessLinks,
  account,
  passkey,
  session,
  user,
} from "@/server/db/schema";
import {
  accessLinkExpiry,
  accessLinkUrl,
  createAccessToken,
} from "@/server/security/access-token";
import { normalizeEmail } from "@/server/security/guards";
import { recordAudit } from "./audit";
import { DomainError, NOT_ALLOWED } from "./errors";

const NOT_FOUND = "Conta não encontrada.";

// Reading ----------------------------------------------------------------------

export type AdminUserItem = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  banned: boolean;
  status: AccountStatus;
  /** ISO timestamps. */
  createdAt: string;
  lastActiveAt: string | null;
  /** User agent of the most recent session, for a device hint. */
  lastUserAgent: string | null;
  sessions: number;
  passkeys: number;
  hasPassword: boolean;
  /** The open link (invite or reset), even when it already expired. */
  openLink: {
    purpose: AccessLinkPurpose;
    createdAt: string;
    expiresAt: string;
  } | null;
  isSelf: boolean;
};

/**
 * Every account with what Administração › Usuários shows: role, status, last
 * activity (the most recent live session), passkeys and the open link. No
 * financial data. Small aggregate queries merged here (the user table is
 * small), instead of correlated subqueries.
 */
export async function listUsersForAdmin(
  actorId: string,
  now = new Date(),
): Promise<AdminUserItem[]> {
  const [users, sessions, latest, passwords, passkeys, links] =
    await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          banned: user.banned,
          createdAt: user.createdAt,
        })
        .from(user),
      db
        .select({
          userId: session.userId,
          total: count(),
          lastActiveAt: max(session.updatedAt),
        })
        .from(session)
        .where(gt(session.expiresAt, now))
        .groupBy(session.userId),
      db
        .selectDistinctOn([session.userId], {
          userId: session.userId,
          userAgent: session.userAgent,
        })
        .from(session)
        .where(gt(session.expiresAt, now))
        .orderBy(session.userId, desc(session.updatedAt)),
      db
        .selectDistinct({ userId: account.userId })
        .from(account)
        .where(
          and(
            eq(account.providerId, "credential"),
            isNotNull(account.password),
          ),
        ),
      db
        .select({ userId: passkey.userId, total: count() })
        .from(passkey)
        .groupBy(passkey.userId),
      db
        .select({
          userId: accessLinks.userId,
          purpose: accessLinks.purpose,
          createdAt: accessLinks.createdAt,
          expiresAt: accessLinks.expiresAt,
        })
        .from(accessLinks)
        .where(and(isNull(accessLinks.usedAt), isNull(accessLinks.revokedAt))),
    ]);

  const sessionsBy = new Map(sessions.map((row) => [row.userId, row]));
  const agentBy = new Map(latest.map((row) => [row.userId, row.userAgent]));
  const withPassword = new Set(passwords.map((row) => row.userId));
  const passkeysBy = new Map(passkeys.map((row) => [row.userId, row.total]));
  const linkBy = new Map(links.map((row) => [row.userId, row]));

  return users
    .map((row): AdminUserItem => {
      const live = sessionsBy.get(row.id);
      const link = linkBy.get(row.id) ?? null;
      const passkeyCount = passkeysBy.get(row.id) ?? 0;
      const hasPassword = withPassword.has(row.id);
      const banned = row.banned === true;
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: toUserRole(row.role),
        banned,
        status: accountStatus(
          {
            banned,
            hasAccess: hasPassword || passkeyCount > 0,
            inviteExpiresAt: link?.purpose === "invite" ? link.expiresAt : null,
          },
          now,
        ),
        createdAt: row.createdAt.toISOString(),
        lastActiveAt: live?.lastActiveAt?.toISOString() ?? null,
        lastUserAgent: agentBy.get(row.id) ?? null,
        sessions: live?.total ?? 0,
        passkeys: passkeyCount,
        hasPassword,
        openLink: link
          ? {
              purpose: link.purpose,
              createdAt: link.createdAt.toISOString(),
              expiresAt: link.expiresAt.toISOString(),
            }
          : null,
        isSelf: row.id === actorId,
      };
    })
    .sort(byName);
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
const byName = (a: AdminUserItem, b: AdminUserItem) =>
  collator.compare(a.name, b.name) || collator.compare(a.email, b.email);

/** Accounts for pickers (per-person flags): id, name and e-mail only. */
export async function listUserNames(): Promise<
  { id: string; name: string; email: string }[]
> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user);
  return rows.sort(
    (a, b) =>
      collator.compare(a.name, b.name) || collator.compare(a.email, b.email),
  );
}

// Locking and guards -------------------------------------------------------------

type LockedAccount = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  banned: boolean;
};

type Locked = {
  actor: LockedAccount;
  target: LockedAccount | null;
  activeAdminIds: string[];
};

/**
 * Locks the actor, the target and every administrator (FOR UPDATE), so two
 * administrators acting on each other at the same time cannot both pass the
 * "last administrator" guard. Refuses unless the actor is still an active
 * administrator: the session check happened before the transaction.
 */
async function lockAccounts(
  tx: Transaction,
  actorId: string,
  targetId: string | null,
): Promise<Locked> {
  const ids = targetId ? [actorId, targetId] : [actorId];
  const rows = await tx
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
    })
    .from(user)
    .where(or(inArray(user.id, ids), like(user.role, "%admin%")))
    .for("update");
  const accounts = rows.map(
    (row): LockedAccount => ({
      ...row,
      role: toUserRole(row.role),
      banned: row.banned === true,
    }),
  );
  const actor = accounts.find((row) => row.id === actorId);
  if (!actor || actor.banned || !hasAdminRole(actor.role)) {
    throw new DomainError(NOT_ALLOWED);
  }
  return {
    actor,
    target: targetId
      ? (accounts.find((row) => row.id === targetId) ?? null)
      : null,
    activeAdminIds: accounts
      .filter((row) => row.role === "admin" && !row.banned)
      .map((row) => row.id),
  };
}

/** Locks, finds the target and applies the guard for `action`. */
async function guarded(
  tx: Transaction,
  actorId: string,
  targetId: string,
  action: AccountAction,
): Promise<{ actor: LockedAccount; target: LockedAccount }> {
  const { actor, target, activeAdminIds } = await lockAccounts(
    tx,
    actorId,
    targetId,
  );
  if (!target) throw new DomainError(NOT_FOUND);
  const blocker = accountActionBlocker(action, {
    actorId,
    target,
    activeAdminIds,
  });
  if (blocker) throw new DomainError(blocker);
  return { actor, target };
}

const auditTarget = (account: LockedAccount) => ({
  id: account.id,
  name: account.name,
  email: account.email,
});

// Links ------------------------------------------------------------------------------

export type CreatedLink = {
  purpose: AccessLinkPurpose;
  /** The only time the token exists outside the person's link. */
  url: string;
  /** ISO timestamp. */
  expiresAt: string;
};

/** Where links point: the app's public origin (BETTER_AUTH_URL), and "now". */
export type LinkOptions = { origin: string; now?: Date };

/**
 * Creates a link for `target`, revoking the open one (a new link replaces the
 * old). An account without a password or passkey gets an invite; one that
 * already had access gets a reset.
 */
async function issueLink(
  tx: Transaction,
  actor: LockedAccount,
  target: LockedAccount,
  origin: string,
  now: Date,
): Promise<CreatedLink> {
  const [credential] = await tx
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, target.id),
        eq(account.providerId, "credential"),
        isNotNull(account.password),
      ),
    )
    .limit(1);
  const [keys] = await tx
    .select({ total: count() })
    .from(passkey)
    .where(eq(passkey.userId, target.id));
  const purpose: AccessLinkPurpose =
    credential || (keys?.total ?? 0) > 0 ? "reset" : "invite";

  await tx
    .update(accessLinks)
    .set({ revokedAt: now })
    .where(
      and(
        eq(accessLinks.userId, target.id),
        isNull(accessLinks.usedAt),
        isNull(accessLinks.revokedAt),
      ),
    );
  const token = createAccessToken();
  const expiresAt = accessLinkExpiry(now);
  await tx.insert(accessLinks).values({
    userId: target.id,
    purpose,
    selector: token.selector,
    verifierHash: token.verifierHash,
    createdBy: actor.id,
    createdAt: now,
    expiresAt,
  });
  return {
    purpose,
    url: accessLinkUrl(origin, token.token),
    expiresAt: expiresAt.toISOString(),
  };
}

// Writing -----------------------------------------------------------------------------

export type NewUserInput = { name: string; email: string; role: UserRole };

const isUniqueViolation = (error: unknown): boolean => {
  const code = (value: unknown) =>
    typeof value === "object" && value !== null && "code" in value
      ? (value as { code: unknown }).code
      : undefined;
  return (
    code(error) === "23505" ||
    code((error as { cause?: unknown } | null)?.cause) === "23505"
  );
};

const EMAIL_TAKEN = "Já existe uma conta com este e-mail.";

/**
 * Creates an account with its own, empty finances and returns its invite
 * link. The account has no password: the person sets one through the link
 * (src/server/domain/access-links.ts), and only then gets the default
 * categories and preferences.
 */
export async function createUserWithInvite(
  actorId: string,
  input: NewUserInput,
  { origin, now = new Date() }: LinkOptions,
): Promise<
  { user: { id: string; name: string; email: string } } & CreatedLink
> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  try {
    return await db.transaction(async (tx) => {
      const { actor } = await lockAccounts(tx, actorId, null);
      const [taken] = await tx
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${email}`)
        .limit(1);
      if (taken) throw new DomainError(EMAIL_TAKEN);

      const created: LockedAccount = {
        id: generateRandomString(32, "a-z", "A-Z", "0-9"),
        name,
        email,
        role: input.role,
        banned: false,
      };
      await tx.insert(user).values({
        id: created.id,
        name,
        email,
        emailVerified: false,
        role: input.role,
        banned: false,
        createdAt: now,
        updatedAt: now,
      });
      const link = await issueLink(tx, actor, created, origin, now);
      await recordAudit(tx, {
        action: "user.created",
        actor,
        target: auditTarget(created),
        metadata: { role: input.role },
      });
      return { user: { id: created.id, name, email }, ...link };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError(EMAIL_TAKEN);
    throw error;
  }
}

/** "Gerar novo convite" / "Gerar link de redefinição". */
export async function createAccessLink(
  actorId: string,
  targetId: string,
  { origin, now = new Date() }: LinkOptions,
): Promise<CreatedLink> {
  return db.transaction(async (tx) => {
    const { actor, target } = await guarded(
      tx,
      actorId,
      targetId,
      "create_link",
    );
    const link = await issueLink(tx, actor, target, origin, now);
    await recordAudit(tx, {
      action: "access_link.created",
      actor,
      target: auditTarget(target),
      metadata: { purpose: link.purpose },
    });
    return link;
  });
}

/** "Invalidar link": the open link stops working right away. */
export async function revokeAccessLink(
  actorId: string,
  targetId: string,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const { actor, target } = await guarded(
      tx,
      actorId,
      targetId,
      "revoke_link",
    );
    const revoked = await tx
      .update(accessLinks)
      .set({ revokedAt: now })
      .where(
        and(
          eq(accessLinks.userId, target.id),
          isNull(accessLinks.usedAt),
          isNull(accessLinks.revokedAt),
        ),
      )
      .returning({ purpose: accessLinks.purpose });
    if (revoked.length === 0) {
      throw new DomainError("Esta conta não tem link aberto.");
    }
    await recordAudit(tx, {
      action: "access_link.revoked",
      actor,
      target: auditTarget(target),
      metadata: { purpose: revoked[0]?.purpose },
    });
  });
}

/**
 * Desativar (banned) ends every session and blocks new sign-ins (the admin
 * plugin refuses to create a session); Reativar lets the person in again with
 * the same password and passkeys.
 */
export async function setUserBanned(
  actorId: string,
  targetId: string,
  banned: boolean,
  now = new Date(),
): Promise<{ sessions: number }> {
  return db.transaction(async (tx) => {
    const { actor, target } = await guarded(
      tx,
      actorId,
      targetId,
      banned ? "ban" : "unban",
    );
    await tx
      .update(user)
      .set({ banned, banReason: null, banExpires: null, updatedAt: now })
      .where(eq(user.id, target.id));
    let ended = 0;
    if (banned) {
      ended = (
        await tx
          .delete(session)
          .where(eq(session.userId, target.id))
          .returning({ id: session.id })
      ).length;
    }
    await recordAudit(tx, {
      action: banned ? "user.banned" : "user.unbanned",
      actor,
      target: auditTarget(target),
      metadata: banned ? { sessions: ended } : {},
    });
    return { sessions: ended };
  });
}

/** "Encerrar sessões": signs the person out everywhere. */
export async function revokeUserSessions(
  actorId: string,
  targetId: string,
): Promise<{ sessions: number }> {
  return db.transaction(async (tx) => {
    const { actor, target } = await guarded(
      tx,
      actorId,
      targetId,
      "revoke_sessions",
    );
    const ended = (
      await tx
        .delete(session)
        .where(eq(session.userId, target.id))
        .returning({ id: session.id })
    ).length;
    await recordAudit(tx, {
      action: "user.sessions_revoked",
      actor,
      target: auditTarget(target),
      metadata: { sessions: ended },
    });
    return { sessions: ended };
  });
}

/**
 * "Tornar administrador" / "Remover administrador". Takes effect on the
 * person's next request: the session lookup reads the role every time.
 */
export async function setUserRole(
  actorId: string,
  targetId: string,
  role: UserRole,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const { actor, target } = await guarded(
      tx,
      actorId,
      targetId,
      role === "admin" ? "promote" : "demote",
    );
    await tx
      .update(user)
      .set({ role, updatedAt: now })
      .where(eq(user.id, target.id));
    await recordAudit(tx, {
      action: "user.role_changed",
      actor,
      target: auditTarget(target),
      metadata: { role },
    });
  });
}

/**
 * "Excluir conta": the account and all its data. Every table with a user_id
 * references the user with ON DELETE CASCADE, and the tables below them
 * cascade from their parents, so one DELETE removes everything, in the same
 * transaction as the audit entry (whose target_user_id then becomes null; the
 * name and e-mail stay as written). The e-mail typed by the administrator
 * must match, as the confirmation.
 */
export async function deleteUserAccount(
  actorId: string,
  targetId: string,
  confirmEmail: string,
): Promise<{ name: string; email: string }> {
  return db.transaction(async (tx) => {
    const { actor, target } = await guarded(tx, actorId, targetId, "delete");
    if (normalizeEmail(confirmEmail) !== normalizeEmail(target.email)) {
      throw new DomainError("Digite o e-mail da conta para confirmar.");
    }
    await recordAudit(tx, {
      action: "user.deleted",
      actor,
      target: auditTarget(target),
      metadata: { role: target.role },
    });
    await tx.delete(user).where(eq(user.id, target.id));
    return { name: target.name, email: target.email };
  });
}
