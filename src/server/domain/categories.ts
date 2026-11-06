import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import {
  type ParentCandidate,
  parentBlocker,
} from "@/lib/categories/hierarchy";
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

/**
 * The category a subcategory goes into, locked (FOR UPDATE) until the
 * transaction ends: a concurrent move of that category under another one
 * waits, and then sees the new child (one level only, no grandchildren).
 * Archived ones come back too, so the caller says why they cannot be used.
 */
export async function requireParentCategory(
  tx: Executor,
  userId: string,
  parentId: string,
): Promise<ParentCandidate & { name: string }> {
  const [row] = await tx
    .select({
      id: categories.id,
      kind: categories.kind,
      name: categories.name,
      parentId: categories.parentId,
      archivedAt: categories.archivedAt,
    })
    .from(categories)
    .where(and(eq(categories.id, parentId), eq(categories.userId, userId)))
    .limit(1)
    .for("update");
  if (!row) throw notFound("Categoria");
  const { archivedAt, ...parent } = row;
  return { ...parent, archived: archivedAt !== null };
}

/** The message for a name already taken at that level (doc 02 §10). */
export function nameTakenMessage(parentName: string | null): string {
  return parentName === null
    ? "Já existe uma categoria com esse nome."
    : `Já existe uma subcategoria com esse nome em ${parentName}.`;
}

/**
 * A new category; with `parentId`, a subcategory of an active main category
 * of the same type (doc 01 §6.3: one level only).
 */
export async function createCategory(
  userId: string,
  input: {
    kind: CategoryKind;
    name: string;
    icon: string;
    color: ColorToken;
    parentId?: string | null;
  },
): Promise<string> {
  const { parentId = null, ...fields } = input;
  return db.transaction(async (tx) => {
    let parentName: string | null = null;
    if (parentId !== null) {
      const parent = await requireParentCategory(tx, userId, parentId);
      const blocker = parentBlocker({
        categoryId: null,
        kind: input.kind,
        parent,
        hasChildren: false,
      });
      if (blocker) throw new DomainError(blocker);
      parentName = parent.name;
    }
    const [row] = await tx
      .insert(categories)
      .values({
        userId,
        ...fields,
        parentId,
        name: input.name.trim(),
        sortOrder: 999,
      })
      .onConflictDoNothing()
      .returning({ id: categories.id });
    if (!row) throw new DomainError(nameTakenMessage(parentName));
    return row.id;
  });
}
