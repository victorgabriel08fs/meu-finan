import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { finAccounts } from "./accounts";
import { categories } from "./categories";
import {
  cents,
  createdAt,
  idColumn,
  localDate,
  oneOf,
  timestamptz,
  updatedAt,
  userIdColumn,
} from "./columns";
import {
  COLOR_TOKENS,
  RECURRENCE_KINDS,
  type RecurrenceKind,
  recurrenceFreq,
  txnKind,
} from "./enums";
import type { GoalExpectedRate } from "./types";

/** A purchase split into 2–72 installments; each installment is a transaction. */
export const installmentPlans = pgTable(
  "installment_plans",
  {
    id: idColumn(),
    userId: userIdColumn(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => finAccounts.id),
    description: text("description").notNull(),
    totalCents: cents("total_cents").notNull(),
    count: smallint("count").notNull(),
    firstDate: localDate("first_date").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("installment_plans_total_cents_check", sql`${t.totalCents} > 0`),
    check("installment_plans_count_check", sql`${t.count} between 2 and 72`),
  ],
);

/** Repeating income or expense, materialised ahead by the daily job. */
export const recurrences = pgTable(
  "recurrences",
  {
    id: idColumn(),
    userId: userIdColumn(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => finAccounts.id),
    categoryId: uuid("category_id").references(() => categories.id),
    kind: txnKind("kind").$type<RecurrenceKind>().notNull(),
    amountCents: cents("amount_cents").notNull(),
    description: text("description").notNull(),
    freq: recurrenceFreq("freq").notNull(),
    interval: smallint("interval").notNull().default(1),
    /** 31 means the last day of the month. */
    byMonthDay: smallint("by_month_day"),
    startOn: localDate("start_on").notNull(),
    endOn: localDate("end_on"),
    /** Horizon already materialised as transactions. */
    generatedUntil: localDate("generated_until").notNull(),
    pausedAt: timestamptz("paused_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("recurrences_kind_check", oneOf(t.kind, RECURRENCE_KINDS)),
    check("recurrences_amount_cents_check", sql`${t.amountCents} <> 0`),
    check("recurrences_interval_check", sql`${t.interval} between 1 and 12`),
    check(
      "recurrences_by_month_day_check",
      sql`${t.byMonthDay} between 1 and 31`,
    ),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: idColumn(),
    userId: userIdColumn(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color", { enum: COLOR_TOKENS }).notNull(),
    targetCents: cents("target_cents").notNull(),
    targetDate: localDate("target_date"),
    accountId: uuid("account_id").references(() => finAccounts.id, {
      onDelete: "set null",
    }),
    initialCents: cents("initial_cents").notNull().default(0),
    monthlyPlanCents: cents("monthly_plan_cents"),
    expectedRate: jsonb("expected_rate").$type<GoalExpectedRate>(),
    achievedAt: timestamptz("achieved_at"),
    archivedAt: timestamptz("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("goals_target_cents_check", sql`${t.targetCents} > 0`)],
);

/** Monthly limit per category; `month` is the first day of the financial month. */
export const budgets = pgTable(
  "budgets",
  {
    id: idColumn(),
    userId: userIdColumn(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: localDate("month").notNull(),
    amountCents: cents("amount_cents").notNull(),
    rollover: boolean("rollover").notNull().default(false),
  },
  (t) => [
    check("budgets_month_check", sql`extract(day from ${t.month}) = 1`),
    check("budgets_amount_cents_check", sql`${t.amountCents} > 0`),
    unique("budgets_user_id_category_id_month_key").on(
      t.userId,
      t.categoryId,
      t.month,
    ),
  ],
);
