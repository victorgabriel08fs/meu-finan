// Break-glass recovery (doc 01 §11.4) with more than one account: it is for
// the owner, the person who controls the deployment (RECOVERY_TOKEN). It
// targets the OWNER_EMAIL account (the first one) or, without it, the oldest
// administrator, and gives that account its administration back.
import { and, asc, eq, like, sql } from "drizzle-orm";
import { db, type Executor } from "@/server/db/client";
import { account, passkey, session, user } from "@/server/db/schema";
import { normalizeEmail } from "@/server/security/guards";
import { recordAudit } from "./audit";

type Target = { id: string; name: string; email: string };

/** The owner's account; never "whichever row comes first". */
export async function recoveryTarget(
  ownerEmail: string | undefined,
  executor: Executor = db,
): Promise<Target | null> {
  const columns = { id: user.id, name: user.name, email: user.email };
  if (ownerEmail) {
    const [owner] = await executor
      .select(columns)
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizeEmail(ownerEmail)}`)
      .limit(1);
    if (owner) return owner;
  }
  const [admin] = await executor
    .select(columns)
    .from(user)
    .where(like(user.role, "%admin%"))
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(1);
  if (admin) return admin;
  const [first] = await executor
    .select(columns)
    .from(user)
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(1);
  return first ?? null;
}

/**
 * Sets the new password, ends every session, optionally removes the passkeys
 * and makes the account an active administrator again (another administrator
 * may have demoted or deactivated it). Returns null when there is no account.
 */
export async function recoverOwnerAccess(input: {
  ownerEmail: string | undefined;
  passwordHash: string;
  removePasskeys: boolean;
}): Promise<Target | null> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const target = await recoveryTarget(input.ownerEmail, tx);
    if (!target) return null;
    const updated = await tx
      .update(account)
      .set({ password: input.passwordHash, updatedAt: now })
      .where(
        and(
          eq(account.userId, target.id),
          eq(account.providerId, "credential"),
        ),
      )
      .returning({ id: account.id });
    if (updated.length === 0) {
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: target.id,
        providerId: "credential",
        userId: target.id,
        password: input.passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    }
    await tx.delete(session).where(eq(session.userId, target.id));
    if (input.removePasskeys) {
      await tx.delete(passkey).where(eq(passkey.userId, target.id));
    }
    await tx
      .update(user)
      .set({ role: "admin", banned: false, updatedAt: now })
      .where(eq(user.id, target.id));
    await recordAudit(tx, {
      action: "access.recovered",
      actor: target,
      target,
      metadata: { removedPasskeys: input.removePasskeys },
    });
    return target;
  });
}
