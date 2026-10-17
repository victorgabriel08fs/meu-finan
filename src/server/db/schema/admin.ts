import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, idColumn, oneOf, timestamptz } from "./columns";
import {
  ACCESS_LINK_PURPOSES,
  type AccessLinkPurpose,
  type AuditAction,
} from "./enums";
import type { AuditMetadata } from "./types";

/**
 * One-time links an administrator hands to a person (doc 01 §11.9): an invite
 * to set the first password of a new account, or a reset for someone who lost
 * access. The URL carries `<selector>.<verifier>`: the selector finds the row
 * and only the SHA-256 of the 32-byte verifier is stored, compared in constant
 * time. Single use (used_at), 72 hours (expires_at); a new link for the same
 * person revokes the open one (revoked_at), so each person has at most one
 * open link (partial unique index).
 */
export const accessLinks = pgTable(
  "access_links",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ACCESS_LINK_PURPOSES })
      .$type<AccessLinkPurpose>()
      .notNull(),
    selector: text("selector").notNull(),
    /** Hex SHA-256 of the verifier; the verifier itself is never stored. */
    verifierHash: text("verifier_hash").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    expiresAt: timestamptz("expires_at").notNull(),
    usedAt: timestamptz("used_at"),
    revokedAt: timestamptz("revoked_at"),
  },
  (t) => [
    check("access_links_purpose_check", oneOf(t.purpose, ACCESS_LINK_PURPOSES)),
    unique("access_links_selector_key").on(t.selector),
    uniqueIndex("access_links_open_per_user")
      .on(t.userId)
      .where(sql`${t.usedAt} is null and ${t.revokedAt} is null`),
  ],
);

/**
 * What administrators did (Administração › Atividade): account changes, links
 * and flags, plus a person accepting their own invite or reset. Names and
 * e-mails are snapshots, so an entry still reads well after an account is
 * deleted (the ids then become null). Ids are UUIDv7, so ordering by id is
 * ordering by time, and the list pages with `id < cursor`.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: idColumn(),
    action: text("action").$type<AuditAction>().notNull(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorName: text("actor_name").notNull(),
    targetUserId: text("target_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    targetName: text("target_name"),
    targetEmail: text("target_email"),
    metadata: jsonb("metadata").$type<AuditMetadata>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_target").on(t.targetUserId)],
);
