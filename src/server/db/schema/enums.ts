import { pgEnum } from "drizzle-orm/pg-core";

// Postgres enums (doc 01 §6.3) -------------------------------------------------

export const finAccountType = pgEnum("fin_account_type", [
  "checking",
  "savings",
  "cash",
  "investment",
  "credit_card",
  "other",
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

// Text columns typed only in TypeScript (the DDL has no CHECK for them) ---------

export const JOB_RUN_STATUSES = ["running", "ok", "partial", "failed"] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "bill_due",
  "invoice_closing",
  "budget_80",
  "budget_100",
  "goal_reached",
  "insight",
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
