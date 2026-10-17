// Audit trail of the administration (doc 01 §11.9): written in the same
// transaction as the change it records, read by Administração › Atividade.
// Never pass a token, a password or financial data in an entry.
import { desc, lt } from "drizzle-orm";
import { db, type Executor } from "@/server/db/client";
import {
  type AuditAction,
  type AuditMetadata,
  auditLog,
} from "@/server/db/schema";

export type AuditEntry = {
  action: AuditAction;
  actor: { id: string; name: string };
  target?: { id: string; name: string; email: string } | null;
  metadata?: AuditMetadata;
};

export async function recordAudit(
  executor: Executor,
  entry: AuditEntry,
): Promise<void> {
  await executor.insert(auditLog).values({
    action: entry.action,
    actorId: entry.actor.id,
    actorName: entry.actor.name,
    targetUserId: entry.target?.id ?? null,
    targetName: entry.target?.name ?? null,
    targetEmail: entry.target?.email ?? null,
    metadata: entry.metadata ?? {},
  });
}

export type AuditItem = {
  id: string;
  action: AuditAction;
  actorId: string | null;
  actorName: string;
  targetUserId: string | null;
  targetName: string | null;
  targetEmail: string | null;
  metadata: AuditMetadata;
  /** ISO timestamp. */
  createdAt: string;
};

export const AUDIT_PAGE_SIZE = 50;

/**
 * Newest first, a page at a time: ids are UUIDv7, so `id < before` is
 * "older than that entry". Only for administrators (the page checks).
 */
export async function listAuditLog(
  options: { before?: string | null; limit?: number } = {},
): Promise<{ items: AuditItem[]; nextCursor: string | null }> {
  const limit = options.limit ?? AUDIT_PAGE_SIZE;
  const rows = await db
    .select()
    .from(auditLog)
    .where(options.before ? lt(auditLog.id, options.before) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    items: page.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actorId,
      actorName: row.actorName,
      targetUserId: row.targetUserId,
      targetName: row.targetName,
      targetEmail: row.targetEmail,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}
