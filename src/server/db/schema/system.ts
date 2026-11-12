import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { finAccounts } from "./accounts";
import { categories } from "./categories";
import {
  createdAt,
  idColumn,
  localDate,
  oneOf,
  timestamptz,
  updatedAt,
  userIdColumn,
} from "./columns";
import {
  HOLIDAY_SOURCES,
  IMPORT_FORMATS,
  importStatus,
  JOB_RUN_STATUSES,
  NOTIFICATION_TYPES,
  rateIndex,
} from "./enums";
import type {
  ImportStats,
  JobRunReport,
  NotificationPayload,
  SimulationParams,
} from "./types";

/**
 * OFX/CSV statement imports (doc 02 §6.13). The file is parsed in memory by
 * the Server Action and never stored, so blob_pathname stays null; the column
 * is kept for a future attachment store. Its transactions point back here
 * through transactions.import_id ("Desfazer importação").
 */
export const imports = pgTable(
  "imports",
  {
    id: idColumn(),
    userId: userIdColumn(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => finAccounts.id),
    blobPathname: text("blob_pathname"),
    format: text("format", { enum: IMPORT_FORMATS }).notNull(),
    status: importStatus("status").notNull().default("uploaded"),
    stats: jsonb("stats").$type<ImportStats>(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [check("imports_format_check", oneOf(t.format, IMPORT_FORMATS))],
);

/**
 * Market indexes from the BCB, global (no user_id), fed by the daily job.
 * CDI/Selic: % a.a.; IPCA: % in the month.
 */
export const marketRates = pgTable(
  "market_rates",
  {
    index: rateIndex("index").notNull(),
    refDate: localDate("ref_date").notNull(),
    value: numeric("value", { precision: 12, scale: 8 }).notNull(),
  },
  (t) => [
    primaryKey({ name: "market_rates_pkey", columns: [t.index, t.refDate] }),
  ],
);

/**
 * National holidays from BrasilAPI, global (no user_id), cached by year by the
 * daily job (syncHolidays). The app reads them united with the calendar it
 * computes (src/lib/finance/business-days.ts), so a stored row only adds a
 * date. `scope` is "BR" for now; state and city holidays would use "BR-SP"
 * and "BR-SP-<IBGE code>".
 */
export const holidays = pgTable(
  "holidays",
  {
    scope: text("scope").notNull(),
    date: localDate("date").notNull(),
    name: text("name").notNull(),
    source: text("source", { enum: HOLIDAY_SOURCES }).notNull(),
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "holidays_pkey", columns: [t.scope, t.date] }),
    check("holidays_source_check", oneOf(t.source, HOLIDAY_SOURCES)),
    check("holidays_name_check", sql`char_length(${t.name}) between 1 and 80`),
  ],
);

export const simulations = pgTable("simulations", {
  id: idColumn(),
  userId: userIdColumn(),
  name: text("name").notNull(),
  params: jsonb("params").$type<SimulationParams>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Learned "description → category" rules used by quick-add and imports. */
export const categorizationRules = pgTable(
  "categorization_rules",
  {
    id: idColumn(),
    userId: userIdColumn(),
    /** Normalised description: lowercase, without accents. */
    pattern: text("pattern").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => finAccounts.id, {
      onDelete: "cascade",
    }),
    hits: integer("hits").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("categorization_rules_user_id_pattern_key").on(t.userId, t.pattern),
  ],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: idColumn(),
  userId: userIdColumn(),
  endpoint: text("endpoint")
    .notNull()
    .unique("push_subscriptions_endpoint_key"),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: idColumn(),
    userId: userIdColumn(),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    /** e.g. `bill_due:<transaction id>`; stops the job from repeating a notice. */
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").$type<NotificationPayload>().notNull(),
    readAt: timestamptz("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("notifications_user_id_dedupe_key_key").on(t.userId, t.dedupeKey),
  ],
);

/** One row per run of a scheduled job. */
export const jobRuns = pgTable("job_runs", {
  id: idColumn(),
  job: text("job").notNull(),
  startedAt: timestamptz("started_at").notNull().defaultNow(),
  finishedAt: timestamptz("finished_at"),
  status: text("status", { enum: JOB_RUN_STATUSES })
    .notNull()
    .default("running"),
  report: jsonb("report").$type<JobRunReport>(),
});
