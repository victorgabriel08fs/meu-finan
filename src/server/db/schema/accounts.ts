import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
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
  finAccountType,
  rateIndex,
  SNAPSHOT_SOURCES,
  YIELD_TAX_MODES,
} from "./enums";

/**
 * Financial accounts. Named fin_accounts because Better Auth owns `account`.
 * A credit card is an account of type credit_card (balance <= 0).
 */
export const finAccounts = pgTable(
  "fin_accounts",
  {
    id: idColumn(),
    userId: userIdColumn(),
    name: text("name").notNull(),
    type: finAccountType("type").notNull(),
    color: text("color", { enum: COLOR_TOKENS }).notNull(),
    /** Lucide icon name, e.g. `wallet`. */
    icon: text("icon").notNull(),
    initialBalanceCents: cents("initial_balance_cents").notNull().default(0),
    includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamptz("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "fin_accounts_name_check",
      sql`char_length(${t.name}) between 1 and 60`,
    ),
    index("fin_accounts_user")
      .on(t.userId, t.sortOrder)
      .where(sql`${t.archivedAt} is null`),
  ],
);

export const creditCardDetails = pgTable(
  "credit_card_details",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => finAccounts.id, { onDelete: "cascade" }),
    limitCents: cents("limit_cents").notNull(),
    closingDay: smallint("closing_day").notNull(),
    dueDay: smallint("due_day").notNull(),
    /** Default account that pays the invoice. */
    paymentAccountId: uuid("payment_account_id").references(
      () => finAccounts.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    check("credit_card_details_limit_cents_check", sql`${t.limitCents} >= 0`),
    check(
      "credit_card_details_closing_day_check",
      sql`${t.closingDay} between 1 and 31`,
    ),
    check(
      "credit_card_details_due_day_check",
      sql`${t.dueDay} between 1 and 31`,
    ),
  ],
);

/** Expected yield of an investment account, for projections. */
export const accountYield = pgTable(
  "account_yield",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => finAccounts.id, { onDelete: "cascade" }),
    index: rateIndex("index").notNull(),
    /** 1.0200 = 102% do CDI */
    pctOfIndex: numeric("pct_of_index", { precision: 7, scale: 4 }),
    /** 0.060000 = IPCA + 6% */
    spreadAnnual: numeric("spread_annual", { precision: 7, scale: 6 }),
    /** Prefixado */
    fixedAnnual: numeric("fixed_annual", { precision: 7, scale: 6 }),
    taxMode: text("tax_mode", { enum: YIELD_TAX_MODES })
      .notNull()
      .default("regressive"),
  },
  (t) => [
    check("account_yield_tax_mode_check", oneOf(t.taxMode, YIELD_TAX_MODES)),
  ],
);

/**
 * Credit card invoices, identified by the due month. Total, amount paid and
 * status are derived from the transactions (doc 03 §9).
 */
export const cardInvoices = pgTable(
  "card_invoices",
  {
    id: idColumn(),
    userId: userIdColumn(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => finAccounts.id, { onDelete: "cascade" }),
    /** First day of the due month. */
    referenceMonth: localDate("reference_month").notNull(),
    closingDate: localDate("closing_date").notNull(),
    dueDate: localDate("due_date").notNull(),
  },
  (t) => [
    check(
      "card_invoices_reference_month_check",
      sql`extract(day from ${t.referenceMonth}) = 1`,
    ),
    unique("card_invoices_account_id_reference_month_key").on(
      t.accountId,
      t.referenceMonth,
    ),
  ],
);

/** Month-end balances written by the daily job (or adjusted by hand). */
export const balanceSnapshots = pgTable(
  "balance_snapshots",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => finAccounts.id, { onDelete: "cascade" }),
    onDate: localDate("on_date").notNull(),
    balanceCents: cents("balance_cents").notNull(),
    source: text("source", { enum: SNAPSHOT_SOURCES })
      .notNull()
      .default("auto"),
  },
  (t) => [
    primaryKey({
      name: "balance_snapshots_pkey",
      columns: [t.accountId, t.onDate],
    }),
    check("balance_snapshots_source_check", oneOf(t.source, SNAPSHOT_SOURCES)),
  ],
);
