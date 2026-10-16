import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, type Executor } from "@/server/db/client";
import {
  type CategoryKind,
  type ColorToken,
  categories,
  transactions,
} from "@/server/db/schema";
import { DomainError, notFound } from "./errors";

export type CategoryItem = {
  id: string;
  kind: CategoryKind;
  name: string;
  icon: string;
  color: ColorToken;
  parentId: string | null;
};

const columns = {
  id: categories.id,
  kind: categories.kind,
  name: categories.name,
  icon: categories.icon,
  color: categories.color,
  parentId: categories.parentId,
};

export async function listCategories(
  userId: string,
  kind?: CategoryKind,
  executor: Executor = db,
): Promise<CategoryItem[]> {
  return executor
    .select(columns)
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        isNull(categories.archivedAt),
        kind ? eq(categories.kind, kind) : undefined,
      ),
    )
    .orderBy(
      asc(categories.kind),
      asc(categories.sortOrder),
      asc(categories.name),
    );
}

/**
 * Categories ordered by use in the last 90 days, then by their default order —
 * the quick-add chips (doc 02 §6.5).
 */
export async function categoriesByUse(
  userId: string,
  kind: CategoryKind,
  sinceIso: string,
): Promise<CategoryItem[]> {
  const uses = sql<number>`count(${transactions.id})`.mapWith(Number);
  const rows = await db
    .select({ ...columns, uses, sortOrder: categories.sortOrder })
    .from(categories)
    .leftJoin(
      transactions,
      and(
        eq(transactions.categoryId, categories.id),
        isNull(transactions.deletedAt),
        gte(transactions.occurredOn, sinceIso),
      ),
    )
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.kind, kind),
        isNull(categories.archivedAt),
      ),
    )
    .groupBy(categories.id)
    .orderBy(desc(uses), asc(categories.sortOrder));
  return rows.map(({ uses: _uses, sortOrder: _sortOrder, ...item }) => item);
}

/** Ownership check for a category id received from the client. */
export async function requireCategory(
  executor: Executor,
  userId: string,
  categoryId: string,
  kind?: CategoryKind,
): Promise<CategoryItem> {
  const [row] = await executor
    .select({ ...columns, archivedAt: categories.archivedAt })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Categoria");
  if (row.archivedAt) throw new DomainError("Esta categoria está arquivada.");
  if (kind && row.kind !== kind) {
    throw new DomainError(
      kind === "expense"
        ? "Escolha uma categoria de despesa."
        : "Escolha uma categoria de receita.",
    );
  }
  const { archivedAt: _archivedAt, ...item } = row;
  return item;
}

export async function createCategory(
  userId: string,
  input: { kind: CategoryKind; name: string; icon: string; color: ColorToken },
): Promise<string> {
  const [row] = await db
    .insert(categories)
    .values({ userId, ...input, name: input.name.trim(), sortOrder: 999 })
    .onConflictDoNothing()
    .returning({ id: categories.id });
  if (!row) throw new DomainError("Já existe uma categoria com esse nome.");
  return row.id;
}
