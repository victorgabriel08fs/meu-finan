// The category suggester (shared by the statement import and "Lançamento por
// texto"): a rule for exactly this merchant, the person's own history, a rule
// contained in the description, then a similar description (see
// src/lib/import/suggest.ts). Every query is scoped by the user id on the
// entry and on the category.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  type CategoryRule,
  type CategorySuggester,
  createCategorySuggester,
  type EntryKind,
  type HistoryEntry,
} from "@/lib/import/suggest";
import { db } from "@/server/db/client";
import {
  categories,
  categorizationRules,
  transactions,
} from "@/server/db/schema";

/** The user's descriptions with their categories, most recent first. */
export async function categoryHistory(
  userId: string,
  kind?: EntryKind,
): Promise<HistoryEntry[]> {
  const uses = sql<number>`count(*)`.mapWith(Number);
  const lastUsedOn = sql<string>`to_char(max(${transactions.occurredOn}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      description: transactions.description,
      kind: transactions.kind,
      categoryId: transactions.categoryId,
      uses,
      lastUsedOn,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(categories.userId, userId),
        isNull(transactions.deletedAt),
        isNull(categories.archivedAt),
        kind
          ? eq(transactions.kind, kind)
          : inArray(transactions.kind, ["income", "expense"]),
      ),
    )
    .groupBy(
      transactions.description,
      transactions.kind,
      transactions.categoryId,
    )
    .orderBy(desc(lastUsedOn))
    .limit(5000);
  return rows.flatMap((row) =>
    row.categoryId !== null && (row.kind === "income" || row.kind === "expense")
      ? [{ ...row, kind: row.kind, categoryId: row.categoryId }]
      : [],
  );
}

/** Explicit "description → category" rules of active categories. */
export async function categoryRules(
  userId: string,
  kind?: EntryKind,
): Promise<CategoryRule[]> {
  return db
    .select({
      pattern: categorizationRules.pattern,
      kind: categories.kind,
      categoryId: categorizationRules.categoryId,
      accountId: categorizationRules.accountId,
      hits: categorizationRules.hits,
    })
    .from(categorizationRules)
    .innerJoin(categories, eq(categories.id, categorizationRules.categoryId))
    .where(
      and(
        eq(categorizationRules.userId, userId),
        eq(categories.userId, userId),
        isNull(categories.archivedAt),
        kind ? eq(categories.kind, kind) : undefined,
      ),
    );
}

export async function loadCategorySuggester(
  userId: string,
  kind?: EntryKind,
): Promise<CategorySuggester> {
  const [history, rules] = await Promise.all([
    categoryHistory(userId, kind),
    categoryRules(userId, kind),
  ]);
  return createCategorySuggester(history, rules);
}
