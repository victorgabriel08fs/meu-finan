import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import {
  cents,
  createdAt,
  idColumn,
  localDate,
  oneOf,
  timestamptz,
  updatedAt,
} from "./columns";
import {
  SHARE_MEMBER_ROLES,
  SHARE_MEMBER_STATUSES,
  SHARE_SPLIT_METHODS,
  type ShareMemberRole,
  type ShareMemberStatus,
  type ShareSplitMethod,
} from "./enums";
import { transactions } from "./transactions";
import type { ShareDefaultSplit } from "./types";

// Shared finances between accounts (ADR-13, doc 01 §11.11). These are the
// only tables more than one account reads: the active members of a group, and
// only through src/server/domain/sharing. Nothing here points into anyone's
// private rows except shared_expenses.source_transaction_id, which only its
// creator's queries follow.

/** A group of up to 6 people ("Casa", "Viagem") who divide expenses. */
export const shareGroups = pgTable(
  "share_groups",
  {
    id: idColumn(),
    name: text("name").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** How a new expense is divided until someone changes it. */
    defaultSplit: jsonb("default_split").$type<ShareDefaultSplit>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "share_groups_name_check",
      sql`char_length(${t.name}) between 1 and 40`,
    ),
    check(
      "share_groups_default_split_check",
      sql`jsonb_typeof(${t.defaultSplit}) = 'object'`,
    ),
  ],
);

/**
 * Everyone invited to a group, whatever came of it. `user_id` is null for an
 * e-mail without an account (the invite only expires) and for an account
 * deleted later: the name stays, so the history still reads "Bruno (conta
 * excluída)". The only foreign key to "user"(id) named user_id that is not
 * ON DELETE CASCADE.
 */
export const shareMembers = pgTable(
  "share_members",
  {
    id: idColumn(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => shareGroups.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** As typed by whoever invited, normalised (lowercase, trimmed). */
    invitedEmail: text("invited_email").notNull(),
    /** The account's name when invited or joined; the e-mail without an account. */
    displayName: text("display_name").notNull(),
    role: text("role", { enum: SHARE_MEMBER_ROLES })
      .$type<ShareMemberRole>()
      .notNull()
      .default("member"),
    status: text("status", { enum: SHARE_MEMBER_STATUSES })
      .$type<ShareMemberStatus>()
      .notNull(),
    invitedBy: text("invited_by").references(() => user.id, {
      onDelete: "set null",
    }),
    invitedAt: timestamptz("invited_at").notNull().defaultNow(),
    /** Until when an invite can be answered; null for the group's creator. */
    expiresAt: timestamptz("expires_at"),
    respondedAt: timestamptz("responded_at"),
    leftAt: timestamptz("left_at"),
  },
  (t) => [
    check("share_members_role_check", oneOf(t.role, SHARE_MEMBER_ROLES)),
    check("share_members_status_check", oneOf(t.status, SHARE_MEMBER_STATUSES)),
    uniqueIndex("share_members_group_user_key")
      .on(t.groupId, t.userId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex("share_members_group_email_open_key")
      .on(t.groupId, t.invitedEmail)
      .where(sql`${t.status} in ('invited', 'active')`),
    index("share_members_user_status_idx").on(t.userId, t.status),
  ],
);

/**
 * An expense divided in a group: a snapshot (description, amount, date) of
 * what a member typed or copied from one of their own entries. The id comes
 * from the client, so sending the same expense twice adds it once.
 */
export const sharedExpenses = pgTable(
  "shared_expenses",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => shareGroups.id, { onDelete: "cascade" }),
    createdByMember: uuid("created_by_member")
      .notNull()
      .references(() => shareMembers.id),
    paidByMember: uuid("paid_by_member")
      .notNull()
      .references(() => shareMembers.id),
    description: text("description").notNull(),
    amountCents: cents("amount_cents").notNull(),
    occurredOn: localDate("occurred_on").notNull(),
    splitMethod: text("split_method", { enum: SHARE_SPLIT_METHODS })
      .$type<ShareSplitMethod>()
      .notNull(),
    /** The creator's own entry it was copied from; read only for the creator. */
    sourceTransactionId: uuid("source_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamptz("deleted_at"),
  },
  (t) => [
    check(
      "shared_expenses_description_check",
      sql`char_length(${t.description}) between 1 and 80`,
    ),
    check("shared_expenses_amount_cents_check", sql`${t.amountCents} > 0`),
    check(
      "shared_expenses_split_method_check",
      oneOf(t.splitMethod, SHARE_SPLIT_METHODS),
    ),
    // An entry is divided in one group at a time.
    uniqueIndex("shared_expenses_source_key")
      .on(t.sourceTransactionId)
      .where(
        sql`${t.deletedAt} is null and ${t.sourceTransactionId} is not null`,
      ),
    index("shared_expenses_group_date_idx").on(t.groupId, t.occurredOn),
  ],
);

/**
 * Each taking member's part of an expense. `input` is what was chosen for
 * them (equal: 1; percent: basis points; shares: weight; amounts: cents) and
 * `share_cents` the result of src/lib/finance/split.ts.
 */
export const sharedExpenseShares = pgTable(
  "shared_expense_shares",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => sharedExpenses.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => shareMembers.id),
    input: integer("input").notNull(),
    shareCents: cents("share_cents").notNull(),
  },
  (t) => [
    primaryKey({
      name: "shared_expense_shares_pkey",
      columns: [t.expenseId, t.memberId],
    }),
    check("shared_expense_shares_input_check", sql`${t.input} >= 0`),
    check("shared_expense_shares_share_cents_check", sql`${t.shareCents} >= 0`),
  ],
);

/** "Marcar como acertado": `from` paid `to`, outside the app. */
export const shareSettlements = pgTable(
  "share_settlements",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => shareGroups.id, { onDelete: "cascade" }),
    fromMember: uuid("from_member")
      .notNull()
      .references(() => shareMembers.id),
    toMember: uuid("to_member")
      .notNull()
      .references(() => shareMembers.id),
    amountCents: cents("amount_cents").notNull(),
    occurredOn: localDate("occurred_on").notNull(),
    createdByMember: uuid("created_by_member")
      .notNull()
      .references(() => shareMembers.id),
    createdAt: createdAt(),
    deletedAt: timestamptz("deleted_at"),
  },
  (t) => [
    check(
      "share_settlements_members_check",
      sql`${t.fromMember} <> ${t.toMember}`,
    ),
    check("share_settlements_amount_cents_check", sql`${t.amountCents} > 0`),
    index("share_settlements_group_idx").on(t.groupId),
  ],
);
