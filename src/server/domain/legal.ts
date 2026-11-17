// Acceptance of the terms of use and privacy policy (doc 01 §11.8): the
// version and moment live on the account's row (the session already reads it,
// so the DAL's gate costs no query) and every acceptance is audited.
import { eq } from "drizzle-orm";
import {
  LEGAL_OUTDATED,
  LEGAL_VERSION,
  needsLegalAcceptance,
} from "@/lib/legal/version";
import { db, type Executor } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { recordAudit } from "./audit";
import { DomainError, notFound } from "./errors";

export type LegalAcceptance = {
  version: string | null;
  acceptedAt: Date | null;
};

/** What Ajustes shows: the version the person accepted, and when. */
export async function getLegalAcceptance(
  userId: string,
): Promise<LegalAcceptance> {
  const [row] = await db
    .select({
      version: user.legalVersion,
      acceptedAt: user.legalAcceptedAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ?? { version: null, acceptedAt: null };
}

/**
 * Records the acceptance on the account. Inside a transaction, pass `tx`
 * (the invite does). Always writes the current version, never one from the
 * client.
 */
export async function markLegalAccepted(
  executor: Executor,
  userId: string,
  now: Date,
): Promise<void> {
  await executor
    .update(user)
    .set({ legalVersion: LEGAL_VERSION, legalAcceptedAt: now })
    .where(eq(user.id, userId));
}

/**
 * /aceitar-termos: the person accepts the version their screen showed. An
 * older screen (a deploy changed the text meanwhile) is refused, so nobody
 * accepts a text they did not see. Idempotent: accepting twice writes and
 * audits once.
 */
export async function acceptLegal(
  userId: string,
  version: string,
  now = new Date(),
): Promise<void> {
  if (version !== LEGAL_VERSION) throw new DomainError(LEGAL_OUTDATED);
  await db.transaction(async (tx) => {
    const [person] = await tx
      .select({
        name: user.name,
        email: user.email,
        legalVersion: user.legalVersion,
      })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    if (!person) throw notFound("Conta");
    if (!needsLegalAcceptance(person.legalVersion)) return;

    await markLegalAccepted(tx, userId, now);
    const self = { id: userId, name: person.name, email: person.email };
    await recordAudit(tx, {
      action: "legal.accepted",
      actor: self,
      target: self,
      metadata: { legalVersion: LEGAL_VERSION },
    });
  });
}
