// Relatórios › Etiquetas (task 18, doc 02 §6.12, doc 03 §12): the total per
// tag and the detail of one tag. Same filters as the category report: paid,
// not deleted, accrual basis (purchase date), expenses and income only. An
// entry with two tags counts in both totals.
import { and, between, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db/client";
import {
  type ColorToken,
  categories,
  finAccounts,
  tags,
  transactions,
  transactionTags,
} from "@/server/db/schema";
import type { UserContext } from "./context";
import type { TagItem } from "./tags";

const parentCategory = alias(categories, "parent_category");

export type TagTotal = {
  tagId: string;
  name: string;
  archived: boolean;
  /** Magnitude (positive). */
  expenseCents: number;
  incomeCents: number;
  count: number;
};

const expenseSum =
  sql<number>`coalesce(-sum(${transactions.amountCents}) filter (where ${transactions.kind} = 'expense'), 0)`.mapWith(
    Number,
  );
const incomeSum =
  sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.kind} = 'income'), 0)`.mapWith(
    Number,
  );
const entryCount = sql<number>`count(*)`.mapWith(Number);

const reportFilters = (userId: string, start: string, end: string) =>
  and(
    eq(transactions.userId, userId),
    eq(tags.userId, userId),
    isNull(transactions.deletedAt),
    eq(transactions.status, "paid"),
    inArray(transactions.kind, ["expense", "income"]),
    between(transactions.occurredOn, start, end),
  );

/** The person's tags with paid entries in [start, end], largest expense first. */
export async function tagBreakdown(
  ctx: UserContext,
  start: string,
  end: string,
): Promise<{ items: TagTotal[] }> {
  const rows = await db
    .select({
      tagId: tags.id,
      name: tags.name,
      archivedAt: tags.archivedAt,
      expenseCents: expenseSum,
      incomeCents: incomeSum,
      count: entryCount,
    })
    .from(transactionTags)
    .innerJoin(transactions, eq(transactions.id, transactionTags.transactionId))
    .innerJoin(tags, eq(tags.id, transactionTags.tagId))
    .where(reportFilters(ctx.userId, start, end))
    .groupBy(tags.id, tags.name, tags.archivedAt);
  const items = rows
    .filter((row) => row.count > 0)
    .map(({ archivedAt, ...row }) => ({
      ...row,
      archived: archivedAt !== null,
    }))
    .sort(
      (a, b) =>
        b.expenseCents - a.expenseCents ||
        b.incomeCents - a.incomeCents ||
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
    );
  return { items };
}

export type TagDetailItem = {
  id: string;
  occurredOn: string;
  description: string;
  /** Signed: expenses negative, income positive. */
  amountCents: number;
  kind: "expense" | "income";
  /** "Mercado › Feira" for a subcategory; null without a category. */
  categoryLabel: string | null;
  categoryIcon: string | null;
  categoryColor: ColorToken | null;
  accountName: string;
};

export type TagDetail = {
  tag: TagItem;
  start: string;
  end: string;
  expenseCents: number;
  incomeCents: number;
  count: number;
  /** Newest first. */
  items: TagDetailItem[];
  hasMore: boolean;
};

/**
 * One tag of the person in [start, end] (archived ones too, so an old link
 * still works); null when the id is not one of the person's tags.
 */
export async function tagDetail(
  ctx: UserContext,
  tagId: string,
  start: string,
  end: string,
  limit = 50,
): Promise<TagDetail | null> {
  const { userId } = ctx;
  const [tag] = await db
    .select({ id: tags.id, name: tags.name, archivedAt: tags.archivedAt })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
    .limit(1);
  if (!tag) return null;

  const filters = and(
    reportFilters(userId, start, end),
    eq(transactionTags.tagId, tagId),
  );
  const [[totals], rows] = await Promise.all([
    db
      .select({
        expenseCents: expenseSum,
        incomeCents: incomeSum,
        count: entryCount,
      })
      .from(transactionTags)
      .innerJoin(
        transactions,
        eq(transactions.id, transactionTags.transactionId),
      )
      .innerJoin(tags, eq(tags.id, transactionTags.tagId))
      .where(filters),
    db
      .select({
        id: transactions.id,
        occurredOn: transactions.occurredOn,
        description: transactions.description,
        amountCents: transactions.amountCents,
        kind: transactions.kind,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
        parentName: parentCategory.name,
        accountName: finAccounts.name,
      })
      .from(transactionTags)
      .innerJoin(
        transactions,
        eq(transactions.id, transactionTags.transactionId),
      )
      .innerJoin(tags, eq(tags.id, transactionTags.tagId))
      .innerJoin(finAccounts, eq(finAccounts.id, transactions.accountId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .leftJoin(parentCategory, eq(parentCategory.id, categories.parentId))
      .where(filters)
      .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
      .limit(limit + 1),
  ]);

  return {
    tag: { id: tag.id, name: tag.name, archived: tag.archivedAt !== null },
    start,
    end,
    expenseCents: totals?.expenseCents ?? 0,
    incomeCents: totals?.incomeCents ?? 0,
    count: totals?.count ?? 0,
    items: rows.slice(0, limit).map((row) => ({
      id: row.id,
      occurredOn: row.occurredOn,
      description: row.description,
      amountCents: row.amountCents,
      kind: row.kind === "income" ? "income" : "expense",
      categoryLabel:
        row.categoryName === null
          ? null
          : row.parentName
            ? `${row.parentName} › ${row.categoryName}`
            : row.categoryName,
      categoryIcon: row.categoryIcon,
      categoryColor: row.categoryColor,
      accountName: row.accountName,
    })),
    hasMore: rows.length > limit,
  };
}
