// Category administration (doc 02 §6.14 "Organização"): list with archived
// ones, rename, recolor, change the icon, move into a main category or back
// (one level of subcategories), archive (optionally passing the entries to
// another category) and restore, and the order of the lists. Every id comes
// from the client, so every query is scoped by the session user's id.
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import { moveTargetBlocker, parentBlocker } from "@/lib/categories/hierarchy";
import { siblingSortOrders } from "@/lib/categories/order";
import { db } from "@/server/db/client";
import {
  budgets,
  type CategoryKind,
  type ColorToken,
  categories,
  transactions,
} from "@/server/db/schema";
import { nameTakenMessage } from "./categories";
import { moveCategoryEntries, targetLabel } from "./category-moves";
import { resolvePeriod, type UserContext } from "./context";
import { DomainError, notFound } from "./errors";

export type AdminCategory = {
  id: string;
  kind: CategoryKind;
  name: string;
  icon: string;
  color: ColorToken;
  parentId: string | null;
  archived: boolean;
};

/** Every category of the user, archived included, in the default order. */
export async function listCategoriesForAdmin(
  userId: string,
): Promise<AdminCategory[]> {
  const rows = await db
    .select({
      id: categories.id,
      kind: categories.kind,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      parentId: categories.parentId,
      archivedAt: categories.archivedAt,
    })
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(
      asc(categories.kind),
      asc(categories.sortOrder),
      asc(categories.name),
    );
  return rows.map(({ archivedAt, ...row }) => ({
    ...row,
    archived: archivedAt !== null,
  }));
}

export type CategoryWithUsage = AdminCategory & {
  /** Entries (not deleted, any status) of the category itself. */
  entries: number;
  /** It has a budget this financial month or a later one. */
  upcomingBudget: boolean;
};

/**
 * The categories for Ajustes › Categorias, with what archiving or merging
 * one would move: its entries and whether it has a budget ahead. Two grouped
 * reads next to the list, no correlated subquery.
 */
export async function listCategoriesWithUsage(
  ctx: UserContext,
): Promise<CategoryWithUsage[]> {
  const { userId } = ctx;
  const count = sql<number>`count(*)`.mapWith(Number);
  const [list, counts, budgeted] = await Promise.all([
    listCategoriesForAdmin(userId),
    db
      .select({ categoryId: transactions.categoryId, count })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
          isNotNull(transactions.categoryId),
        ),
      )
      .groupBy(transactions.categoryId),
    db
      .selectDistinct({ categoryId: budgets.categoryId })
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, userId),
          gte(budgets.month, `${resolvePeriod(ctx).month}-01`),
        ),
      ),
  ]);
  const entries = new Map(counts.map((row) => [row.categoryId, row.count]));
  const withBudget = new Set(budgeted.map((row) => row.categoryId));
  return list.map((category) => ({
    ...category,
    entries: entries.get(category.id) ?? 0,
    upcomingBudget: withBudget.has(category.id),
  }));
}

export type CategoryPatch = {
  name?: string;
  icon?: string;
  color?: ColorToken;
  /** undefined: unchanged · null: a main category · an id: its new parent. */
  parentId?: string | null;
};

/**
 * Renames, recolors, changes the icon or moves a category (into a main
 * category, or back to the top level). One transaction: the category and its
 * new parent are locked together (in id order, so two moves never deadlock),
 * and whether it has children is read inside it, so a subcategory created at
 * the same time never ends up as a grandchild.
 */
export async function updateCategory(
  ctx: UserContext,
  categoryId: string,
  patch: CategoryPatch,
): Promise<void> {
  const { userId } = ctx;
  const name = patch.name?.trim();
  if (name !== undefined && (name.length < 1 || name.length > 40)) {
    throw new DomainError("Use um nome de 1 a 40 caracteres.");
  }
  await db.transaction(async (tx) => {
    const ids =
      typeof patch.parentId === "string" && patch.parentId !== categoryId
        ? [categoryId, patch.parentId]
        : [categoryId];
    const locked = await tx
      .select({
        id: categories.id,
        kind: categories.kind,
        name: categories.name,
        parentId: categories.parentId,
        archivedAt: categories.archivedAt,
      })
      .from(categories)
      .where(and(eq(categories.userId, userId), inArray(categories.id, ids)))
      .orderBy(asc(categories.id))
      .for("update");
    const row = locked.find((item) => item.id === categoryId);
    if (!row) throw notFound("Categoria");

    let parentId = row.parentId;
    const moves = patch.parentId !== undefined && patch.parentId !== parentId;
    if (moves && patch.parentId === null) parentId = null;
    if (moves && typeof patch.parentId === "string") {
      const found =
        patch.parentId === categoryId
          ? row
          : locked.find((item) => item.id === patch.parentId);
      if (!found) throw notFound("Categoria");
      const [child] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.userId, userId),
            eq(categories.parentId, categoryId),
          ),
        )
        .limit(1);
      const blocker = parentBlocker({
        categoryId,
        kind: row.kind,
        parent: { ...found, archived: found.archivedAt !== null },
        hasChildren: child !== undefined,
      });
      if (blocker) throw new DomainError(blocker);
      // Budgets live on main categories (doc 03 §11): a category with a
      // budget this month or ahead would take it inside another one.
      const [budget] = await tx
        .select({ id: budgets.id })
        .from(budgets)
        .where(
          and(
            eq(budgets.userId, userId),
            eq(budgets.categoryId, categoryId),
            gte(budgets.month, `${resolvePeriod(ctx).month}-01`),
          ),
        )
        .limit(1);
      if (budget) {
        throw new DomainError(
          "Esta categoria tem orçamento neste mês ou nos próximos. Apague o orçamento para colocá-la dentro de outra.",
        );
      }
      parentId = found.id;
    }

    // Names are unique per level, archived categories included (the unique
    // key is NULLS NOT DISTINCT), so a clash gets a readable message.
    const finalName = name ?? row.name;
    if (finalName !== row.name || parentId !== row.parentId) {
      const [clash] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.userId, userId),
            eq(categories.name, finalName),
            ne(categories.id, categoryId),
            parentId === null
              ? isNull(categories.parentId)
              : eq(categories.parentId, parentId),
          ),
        )
        .limit(1);
      if (clash) {
        let parentName: string | null = null;
        if (parentId !== null) {
          const [parent] = await tx
            .select({ name: categories.name })
            .from(categories)
            .where(
              and(eq(categories.id, parentId), eq(categories.userId, userId)),
            )
            .limit(1);
          parentName = parent?.name ?? null;
        }
        throw new DomainError(nameTakenMessage(parentName));
      }
    }

    const changes = {
      ...(name !== undefined ? { name } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      // A new parent (or none): to the end of the new list of siblings.
      ...(parentId !== row.parentId ? { parentId, sortOrder: 999 } : {}),
    };
    if (Object.keys(changes).length === 0) return;
    await tx
      .update(categories)
      .set(changes)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
  });
}

export type ArchiveResult = {
  /** The category archived or restored. */
  name: string;
  /** Subcategories archived or restored along with it. */
  children: number;
  /** The archived parent that restoring a subcategory brought back. */
  restoredParent: string | null;
  /** Where the entries went ("Passar para"); null when they stayed. */
  moved: { entries: number; to: string } | null;
};

/**
 * Archives or restores a category. Archived categories leave the pickers and
 * the budgets; past entries keep pointing at them, so nothing is lost.
 * Archiving a main category archives its active subcategories at the same
 * moment, and restoring it brings back those (and only those): Desfazer
 * undoes exactly what was done. Restoring a subcategory of an archived parent
 * restores the parent too, or it would have nowhere to show.
 *
 * With `moveTo`, archiving also passes everything of the category and of the
 * subcategories archived with it (entries, recurrences, rules, budgets) to
 * that category, which cannot be undone: restoring brings them back empty.
 * Both are locked in id order, so two of these never deadlock.
 */
export async function setCategoryArchived(
  userId: string,
  categoryId: string,
  archived: boolean,
  moveTo?: string | null,
): Promise<ArchiveResult> {
  const targetId = archived ? (moveTo ?? null) : null;
  return db.transaction(async (tx) => {
    const ids =
      targetId !== null && targetId !== categoryId
        ? [categoryId, targetId]
        : [categoryId];
    const locked = await tx
      .select({
        id: categories.id,
        kind: categories.kind,
        name: categories.name,
        parentId: categories.parentId,
        archivedAt: categories.archivedAt,
      })
      .from(categories)
      .where(and(eq(categories.userId, userId), inArray(categories.id, ids)))
      .orderBy(asc(categories.id))
      .for("update");
    const row = locked.find((item) => item.id === categoryId);
    const target =
      targetId === null ? null : locked.find((item) => item.id === targetId);
    if (!row || target === undefined) throw notFound("Categoria");
    const result: ArchiveResult = {
      name: row.name,
      children: 0,
      restoredParent: null,
      moved: null,
    };
    // Already as asked (a repeated tap, a stale screen): nothing changes.
    if ((row.archivedAt !== null) === archived) return result;

    const owned = (id: string) =>
      and(eq(categories.id, id), eq(categories.userId, userId));
    const children = (extra: SQL) =>
      and(
        eq(categories.userId, userId),
        eq(categories.parentId, categoryId),
        extra,
      );

    if (archived) {
      const at = new Date();
      await tx
        .update(categories)
        .set({ archivedAt: at })
        .where(owned(categoryId));
      const along = await tx
        .update(categories)
        .set({ archivedAt: at })
        .where(children(isNull(categories.archivedAt)))
        .returning({ id: categories.id });
      result.children = along.length;
      if (target) {
        const archivedNow = [categoryId, ...along.map((child) => child.id)];
        const blocker = moveTargetBlocker({
          mode: "archive",
          source: { ...row, hasChildren: along.length > 0 },
          target: { ...target, archived: target.archivedAt !== null },
          excluded: archivedNow,
        });
        // Thrown inside the transaction: the archive above is undone too.
        if (blocker) throw new DomainError(blocker);
        result.moved = {
          entries: await moveCategoryEntries(tx, userId, archivedNow, target),
          to: await targetLabel(tx, userId, target),
        };
      }
      return result;
    }

    if (row.archivedAt) {
      const along = await tx
        .update(categories)
        .set({ archivedAt: null })
        .where(children(eq(categories.archivedAt, row.archivedAt)))
        .returning({ id: categories.id });
      result.children = along.length;
    }
    await tx
      .update(categories)
      .set({ archivedAt: null })
      .where(owned(categoryId));
    if (row.parentId) {
      const [parent] = await tx
        .update(categories)
        .set({ archivedAt: null })
        .where(and(owned(row.parentId), isNotNull(categories.archivedAt)))
        .returning({ name: categories.name });
      result.restoredParent = parent?.name ?? null;
    }
    return result;
  });
}

/**
 * Saves the order of the active categories of one type ("Mudar a ordem"):
 * `orderedIds` must be exactly those categories, or the list changed while
 * the person was ordering (a category created, archived or moved elsewhere)
 * and nothing is saved. Only the relative order among siblings counts, and
 * only the `sort_order` values that change are written; archived categories
 * keep theirs. The categories are locked in id order while it is saved.
 */
export async function reorderCategories(
  userId: string,
  kind: CategoryKind,
  orderedIds: readonly string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: categories.id,
        parentId: categories.parentId,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.kind, kind),
          isNull(categories.archivedAt),
        ),
      )
      .orderBy(asc(categories.id))
      .for("update");
    const known = new Set(rows.map((row) => row.id));
    const unique = new Set(orderedIds);
    if (
      unique.size !== orderedIds.length ||
      unique.size !== known.size ||
      orderedIds.some((id) => !known.has(id))
    ) {
      throw new DomainError(
        "As categorias mudaram enquanto você ordenava. Atualize a página e tente de novo.",
      );
    }
    const orders = siblingSortOrders(rows, orderedIds);
    for (const row of rows) {
      const sortOrder = orders.get(row.id);
      if (sortOrder === undefined || sortOrder === row.sortOrder) continue;
      await tx
        .update(categories)
        .set({ sortOrder })
        .where(and(eq(categories.id, row.id), eq(categories.userId, userId)));
    }
  });
}
