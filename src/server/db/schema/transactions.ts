import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cardInvoices, finAccounts } from "./accounts";
import { categories, tags } from "./categories";
import {
  cents,
  createdAt,
  idColumn,
  localDate,
  timestamptz,
  updatedAt,
  userIdColumn,
} from "./columns";
import { txnKind, txnStatus } from "./enums";
import { goals, installmentPlans, recurrences } from "./planning";
import { imports } from "./system";

/**
 * The ledger. Amounts are signed per account (inflow > 0, outflow < 0);
 * balances are always derived from these rows. A transfer is two rows sharing
 * transfer_id. Soft-deleted rows keep deleted_at for "Desfazer".
 */
export const transactions = pgTable(
  "transactions",
  {
    id: idColumn(),
    userId: userIdColumn(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => finAccounts.id),
    categoryId: uuid("category_id").references(() => categories.id),
    kind: txnKind("kind").notNull(),
    status: txnStatus("status").notNull().default("paid"),
    amountCents: cents("amount_cents").notNull(),
    description: text("description").notNull(),
    notes: text("notes"),
    occurredOn: localDate("occurred_on").notNull(),
    paidAt: timestamptz("paid_at"),
    transferId: uuid("transfer_id"),
    invoiceId: uuid("invoice_id").references(() => cardInvoices.id),
    installmentPlanId: uuid("installment_plan_id").references(
      () => installmentPlans.id,
      { onDelete: "cascade" },
    ),
    installmentNumber: smallint("installment_number"),
    recurrenceId: uuid("recurrence_id").references(() => recurrences.id, {
      onDelete: "set null",
    }),
    goalId: uuid("goal_id").references(() => goals.id, {
      onDelete: "set null",
    }),
    importId: uuid("import_id").references(() => imports.id, {
      onDelete: "set null",
    }),
    /** OFX FITID or CSV row hash. */
    externalId: text("external_id"),
    attachmentPathname: text("attachment_pathname"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamptz("deleted_at"),
  },
  (t) => [
    check("transactions_amount_cents_check", sql`${t.amountCents} <> 0`),
    check(
      "transactions_description_check",
      sql`char_length(${t.description}) between 1 and 120`,
    ),
    check(
      "transfer_pair",
      sql`${t.kind} <> 'transfer' or ${t.transferId} is not null`,
    ),
    check(
      "installment_fields",
      sql`(${t.installmentPlanId} is null) = (${t.installmentNumber} is null)`,
    ),
    // Drizzle defaults to NULLS LAST; Postgres' `desc` means NULLS FIRST, which
    // is what `order by occurred_on desc, id desc` needs to read the index in order.
    index("txn_user_date")
      .on(t.userId, t.occurredOn.desc().nullsFirst(), t.id.desc().nullsFirst())
      .where(sql`${t.deletedAt} is null`),
    index("txn_account_date")
      .on(t.accountId, t.occurredOn.desc().nullsFirst())
      .where(sql`${t.deletedAt} is null`),
    index("txn_user_cat_date")
      .on(t.userId, t.categoryId, t.occurredOn)
      .where(sql`${t.deletedAt} is null`),
    index("txn_pending")
      .on(t.userId, t.occurredOn)
      .where(sql`${t.status} = 'pending' and ${t.deletedAt} is null`),
    index("txn_invoice").on(t.invoiceId).where(sql`${t.invoiceId} is not null`),
    index("txn_transfer")
      .on(t.transferId)
      .where(sql`${t.transferId} is not null`),
    uniqueIndex("txn_external")
      .on(t.accountId, t.externalId)
      .where(sql`${t.externalId} is not null`),
    // Includes soft-deleted rows on purpose: a deleted occurrence is not recreated by the job.
    uniqueIndex("txn_recurrence_occ")
      .on(t.recurrenceId, t.occurredOn)
      .where(sql`${t.recurrenceId} is not null`),
    // Accent- and typo-tolerant search. f_unaccent comes from the custom migration
    // (src/server/db/sql/0000_extensions.sql); the opclass sits inside the
    // expression because Drizzle only offers .op() on plain columns.
    index("txn_search").using(
      "gin",
      sql`f_unaccent(lower(${t.description})) gin_trgm_ops`,
    ),
  ],
);

export const transactionTags = pgTable(
  "transaction_tags",
  {
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({
      name: "transaction_tags_pkey",
      columns: [t.transactionId, t.tagId],
    }),
  ],
);
