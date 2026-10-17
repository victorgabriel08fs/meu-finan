// The person's side of an access link (doc 01 §11.9): /convite/[token] shows
// it and the person sets a password with it. Public (no session), so the
// caller rate-limits; a token that does not parse, has an unknown selector or
// a wrong verifier is "not found", with no hint of which.
import { and, eq, isNull } from "drizzle-orm";
import { type AccessLinkState, accessLinkState } from "@/lib/admin/status";
import { db } from "@/server/db/client";
import {
  type AccessLinkPurpose,
  accessLinks,
  account,
  passkey,
  session,
  user,
} from "@/server/db/schema";
import {
  parseAccessToken,
  verifierMatches,
} from "@/server/security/access-token";
import { recordAudit } from "./audit";
import { DomainError } from "./errors";

export type AccessLinkInfo = {
  state: AccessLinkState;
  purpose: AccessLinkPurpose;
  /** First name only: enough to greet, nothing else about the account. */
  firstName: string;
  email: string;
  /** ISO timestamp. */
  expiresAt: string;
};

/** Shown for any link that cannot be used; never says which check failed. */
export const LINK_UNAVAILABLE =
  "Este link não funciona mais. Peça um novo a quem administra o app.";

async function findLink(token: string) {
  const parts = parseAccessToken(token);
  if (!parts) return null;
  const [row] = await db
    .select({
      id: accessLinks.id,
      userId: accessLinks.userId,
      purpose: accessLinks.purpose,
      verifierHash: accessLinks.verifierHash,
      expiresAt: accessLinks.expiresAt,
      usedAt: accessLinks.usedAt,
      revokedAt: accessLinks.revokedAt,
      name: user.name,
      email: user.email,
      banned: user.banned,
    })
    .from(accessLinks)
    .innerJoin(user, eq(user.id, accessLinks.userId))
    .where(eq(accessLinks.selector, parts.selector))
    .limit(1);
  // The verifier is compared in constant time, and a wrong one looks exactly
  // like an unknown selector.
  if (!row || !verifierMatches(parts.verifier, row.verifierHash)) return null;
  return row;
}

/**
 * What /convite shows for a token: null when it is not a link at all. A
 * deactivated account's link counts as revoked.
 */
export async function inspectAccessLink(
  token: string,
  now = new Date(),
): Promise<AccessLinkInfo | null> {
  const row = await findLink(token);
  if (!row) return null;
  const state = row.banned
    ? "revoked"
    : accessLinkState(
        {
          usedAt: row.usedAt,
          revokedAt: row.revokedAt,
          expiresAt: row.expiresAt,
        },
        now,
      );
  return {
    state,
    purpose: row.purpose,
    firstName: row.name.trim().split(/\s+/)[0] ?? row.name,
    email: row.email,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export type AcceptLinkInput = {
  /** Hash of the new password, made by the caller (Better Auth's hasher). */
  passwordHash: string;
  /** Resets only: also remove every passkey (a lost phone). */
  removePasskeys: boolean;
};

export type AcceptedLink = {
  userId: string;
  email: string;
  purpose: AccessLinkPurpose;
};

/**
 * Uses the link: sets the password, ends every session of the account (a
 * reset should lock out whoever had them) and, for a reset, optionally removes
 * the passkeys. Single use even under concurrency: the link is claimed with a
 * conditional update in the same transaction.
 */
export async function acceptAccessLink(
  token: string,
  input: AcceptLinkInput,
  now = new Date(),
): Promise<AcceptedLink> {
  const found = await findLink(token);
  if (!found) throw new DomainError(LINK_UNAVAILABLE);

  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(accessLinks)
      .set({ usedAt: now })
      .where(
        and(
          eq(accessLinks.id, found.id),
          isNull(accessLinks.usedAt),
          isNull(accessLinks.revokedAt),
        ),
      )
      .returning({ expiresAt: accessLinks.expiresAt });
    const [owner] = await tx
      .select({ name: user.name, email: user.email, banned: user.banned })
      .from(user)
      .where(eq(user.id, found.userId))
      .for("update");
    if (!claimed || claimed.expiresAt <= now || !owner || owner.banned) {
      throw new DomainError(LINK_UNAVAILABLE);
    }

    const updated = await tx
      .update(account)
      .set({ password: input.passwordHash, updatedAt: now })
      .where(
        and(
          eq(account.userId, found.userId),
          eq(account.providerId, "credential"),
        ),
      )
      .returning({ id: account.id });
    if (updated.length === 0) {
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: found.userId,
        providerId: "credential",
        userId: found.userId,
        password: input.passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    }
    await tx.delete(session).where(eq(session.userId, found.userId));
    const removePasskeys = found.purpose === "reset" && input.removePasskeys;
    if (removePasskeys) {
      await tx.delete(passkey).where(eq(passkey.userId, found.userId));
    }

    const person = { id: found.userId, name: owner.name, email: owner.email };
    await recordAudit(tx, {
      action: "access_link.accepted",
      actor: person,
      target: person,
      metadata: {
        purpose: found.purpose,
        ...(found.purpose === "reset"
          ? { removedPasskeys: removePasskeys }
          : {}),
      },
    });
    return {
      userId: found.userId,
      email: owner.email,
      purpose: found.purpose,
    };
  });
}
