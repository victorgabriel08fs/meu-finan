import { pgEnum } from "drizzle-orm/pg-core";

// Postgres enums (doc 01 §6.3) -------------------------------------------------

export const finAccountType = pgEnum("fin_account_type", [
  "checking",
  "savings",
  "cash",
  "investment",
  "credit_card",
  "other",
  "savings_box",
  "benefit",
]);
export const txnKind = pgEnum("txn_kind", [
  "income",
  "expense",
  "transfer",
  "adjustment",
]);
export const txnStatus = pgEnum("txn_status", ["pending", "paid"]);
export const categoryKind = pgEnum("category_kind", ["income", "expense"]);
export const rateIndex = pgEnum("rate_index", [
  "fixed",
  "cdi",
  "selic",
  "ipca",
]);
export const recurrenceFreq = pgEnum("recurrence_freq", [
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);
export const importStatus = pgEnum("import_status", [
  "uploaded",
  "parsed",
  "review",
  "done",
  "failed",
]);

export type FinAccountType = (typeof finAccountType.enumValues)[number];
export type TxnKind = (typeof txnKind.enumValues)[number];
export type TxnStatus = (typeof txnStatus.enumValues)[number];
export type CategoryKind = (typeof categoryKind.enumValues)[number];
export type RateIndex = (typeof rateIndex.enumValues)[number];
export type RecurrenceFreq = (typeof recurrenceFreq.enumValues)[number];
export type ImportStatus = (typeof importStatus.enumValues)[number];

/** Recurrences only generate income or expense (CHECK on recurrences.kind). */
export const RECURRENCE_KINDS = [
  "income",
  "expense",
] as const satisfies readonly TxnKind[];
export type RecurrenceKind = (typeof RECURRENCE_KINDS)[number];

// Text columns restricted by a CHECK constraint ---------------------------------

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const REPORT_BASES = ["accrual", "cash"] as const;
export type ReportBasis = (typeof REPORT_BASES)[number];

export const YIELD_TAX_MODES = ["regressive", "exempt"] as const;
export type YieldTaxMode = (typeof YIELD_TAX_MODES)[number];

export const IMPORT_FORMATS = ["ofx", "csv"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const SNAPSHOT_SOURCES = ["auto", "manual"] as const;
export type SnapshotSource = (typeof SNAPSHOT_SOURCES)[number];

/** holidays.source: where a stored holiday came from (the computed calendar is not stored). */
export const HOLIDAY_SOURCES = ["brasilapi"] as const;
export type HolidaySource = (typeof HOLIDAY_SOURCES)[number];

/** share_members.role: who created the group (or got it after them) and everyone else. */
export const SHARE_MEMBER_ROLES = ["owner", "member"] as const;
export type ShareMemberRole = (typeof SHARE_MEMBER_ROLES)[number];

/**
 * share_members.status: invited (until accepted, declined or expired),
 * active, declined, left (also an account deleted while in the group) or
 * removed by the owner.
 */
export const SHARE_MEMBER_STATUSES = [
  "invited",
  "active",
  "declined",
  "left",
  "removed",
] as const;
export type ShareMemberStatus = (typeof SHARE_MEMBER_STATUSES)[number];

/** shared_expenses.split_method; the same list as SPLIT_METHODS (src/lib/finance/split.ts). */
export const SHARE_SPLIT_METHODS = [
  "equal",
  "amounts",
  "percent",
  "shares",
] as const;
export type ShareSplitMethod = (typeof SHARE_SPLIT_METHODS)[number];

/**
 * shared_boxes.target_split: each active member's part of the box's target,
 * equal (the default) or by the percentages in shared_box_members.target_weight.
 */
export const SHARE_BOX_TARGET_SPLITS = ["equal", "percent"] as const;
export type ShareBoxTargetSplit = (typeof SHARE_BOX_TARGET_SPLITS)[number];

/** access_links.purpose: first password of a new account, or a new one. */
export const ACCESS_LINK_PURPOSES = ["invite", "reset"] as const;
export type AccessLinkPurpose = (typeof ACCESS_LINK_PURPOSES)[number];

// Text columns typed only in TypeScript (the DDL has no CHECK for them) ---------

/** audit_log.action; new actions need no migration. */
export const AUDIT_ACTIONS = [
  "setup.completed",
  "user.created",
  "user.banned",
  "user.unbanned",
  "user.sessions_revoked",
  "user.role_changed",
  "user.deleted",
  "access_link.created",
  "access_link.revoked",
  "access_link.accepted",
  "access.recovered",
  "flag.global_set",
  "flag.user_set",
  "job.run_manual",
  "share.invited",
  "share.accepted",
  "share.declined",
  "share.left",
  "share.removed",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const JOB_RUN_STATUSES = ["running", "ok", "partial", "failed"] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

/**
 * The notices of the daily job, one per person per day each (the same list
 * as REMINDER_EVENTS in src/lib/notifications/events.ts).
 */
export const REMINDER_NOTIFICATION_TYPES = [
  "daily_summary",
  "bills_due",
  "non_business_due",
  "income_countdown",
  "weekly_summary",
  "monthly_summary",
] as const;
export type ReminderNotificationType =
  (typeof REMINDER_NOTIFICATION_TYPES)[number];

/** What a group (ADR-13, doc 01 §11.11) tells its members. */
export const SHARE_NOTIFICATION_TYPES = [
  "share_invite",
  "share_joined",
  "share_declined",
  "share_left",
  "share_removed",
  "shared_activity",
  "share_settled",
  "box_activity",
  "box_reached",
] as const;
export type ShareNotificationType = (typeof SHARE_NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPES = [
  "bill_due",
  "invoice_closing",
  "budget_80",
  "budget_100",
  "goal_reached",
  "insight",
  ...REMINDER_NOTIFICATION_TYPES,
  ...SHARE_NOTIFICATION_TYPES,
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Colour token stored in `color` columns: `cat-1`…`cat-8` (doc 02 §3.2) or
 * `neutral` (surface-2 background with text-2 icon, used by "Outros").
 */
export const COLOR_TOKENS = [
  "cat-1",
  "cat-2",
  "cat-3",
  "cat-4",
  "cat-5",
  "cat-6",
  "cat-7",
  "cat-8",
  "neutral",
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];
