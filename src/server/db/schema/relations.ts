// Relations for the relational query API (db.query.*). Relations to the Better
// Auth `user` table are left out: domain queries always filter by user_id.
import { relations } from "drizzle-orm";
import {
  accountYield,
  balanceSnapshots,
  cardInvoices,
  creditCardDetails,
  finAccounts,
} from "./accounts";
import { categories, tags } from "./categories";
import { budgets, goals, installmentPlans, recurrences } from "./planning";
import { categorizationRules, imports } from "./system";
import { transactions, transactionTags } from "./transactions";

export const finAccountsRelations = relations(finAccounts, ({ one, many }) => ({
  // One-to-one, resolved through the `account` relation on the other side.
  creditCard: one(creditCardDetails),
  yield: one(accountYield),
  invoices: many(cardInvoices),
  transactions: many(transactions),
  balanceSnapshots: many(balanceSnapshots),
}));

// payment_account_id has no relation on purpose: a second relation to
// fin_accounts would make finAccounts.creditCard ambiguous.
export const creditCardDetailsRelations = relations(
  creditCardDetails,
  ({ one }) => ({
    account: one(finAccounts, {
      fields: [creditCardDetails.accountId],
      references: [finAccounts.id],
    }),
  }),
);

export const accountYieldRelations = relations(accountYield, ({ one }) => ({
  account: one(finAccounts, {
    fields: [accountYield.accountId],
    references: [finAccounts.id],
  }),
}));

export const cardInvoicesRelations = relations(
  cardInvoices,
  ({ one, many }) => ({
    account: one(finAccounts, {
      fields: [cardInvoices.accountId],
      references: [finAccounts.id],
    }),
    transactions: many(transactions),
  }),
);

export const balanceSnapshotsRelations = relations(
  balanceSnapshots,
  ({ one }) => ({
    account: one(finAccounts, {
      fields: [balanceSnapshots.accountId],
      references: [finAccounts.id],
    }),
  }),
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_parent",
  }),
  children: many(categories, { relationName: "category_parent" }),
  transactions: many(transactions),
  budgets: many(budgets),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  transactions: many(transactionTags),
}));

export const installmentPlansRelations = relations(
  installmentPlans,
  ({ one, many }) => ({
    account: one(finAccounts, {
      fields: [installmentPlans.accountId],
      references: [finAccounts.id],
    }),
    transactions: many(transactions),
  }),
);

export const recurrencesRelations = relations(recurrences, ({ one, many }) => ({
  account: one(finAccounts, {
    fields: [recurrences.accountId],
    references: [finAccounts.id],
  }),
  category: one(categories, {
    fields: [recurrences.categoryId],
    references: [categories.id],
  }),
  transactions: many(transactions),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  account: one(finAccounts, {
    fields: [goals.accountId],
    references: [finAccounts.id],
  }),
  /** Contributions (aportes). */
  transactions: many(transactions),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  category: one(categories, {
    fields: [budgets.categoryId],
    references: [categories.id],
  }),
}));

export const importsRelations = relations(imports, ({ one, many }) => ({
  account: one(finAccounts, {
    fields: [imports.accountId],
    references: [finAccounts.id],
  }),
  transactions: many(transactions),
}));

export const categorizationRulesRelations = relations(
  categorizationRules,
  ({ one }) => ({
    category: one(categories, {
      fields: [categorizationRules.categoryId],
      references: [categories.id],
    }),
    account: one(finAccounts, {
      fields: [categorizationRules.accountId],
      references: [finAccounts.id],
    }),
  }),
);

export const transactionsRelations = relations(
  transactions,
  ({ one, many }) => ({
    account: one(finAccounts, {
      fields: [transactions.accountId],
      references: [finAccounts.id],
    }),
    category: one(categories, {
      fields: [transactions.categoryId],
      references: [categories.id],
    }),
    invoice: one(cardInvoices, {
      fields: [transactions.invoiceId],
      references: [cardInvoices.id],
    }),
    installmentPlan: one(installmentPlans, {
      fields: [transactions.installmentPlanId],
      references: [installmentPlans.id],
    }),
    recurrence: one(recurrences, {
      fields: [transactions.recurrenceId],
      references: [recurrences.id],
    }),
    goal: one(goals, {
      fields: [transactions.goalId],
      references: [goals.id],
    }),
    import: one(imports, {
      fields: [transactions.importId],
      references: [imports.id],
    }),
    tags: many(transactionTags),
  }),
);

export const transactionTagsRelations = relations(
  transactionTags,
  ({ one }) => ({
    transaction: one(transactions, {
      fields: [transactionTags.transactionId],
      references: [transactions.id],
    }),
    tag: one(tags, {
      fields: [transactionTags.tagId],
      references: [tags.id],
    }),
  }),
);
