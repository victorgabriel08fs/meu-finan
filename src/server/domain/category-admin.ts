// Category administration (doc 02 §6.14 "Organização"): list with archived
// ones, rename, recolor, change the icon, archive and restore. Every id comes
// from the client, so every query is scoped by the session user's id.
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  type CategoryKind,
  type ColorToken,
  categories,
} from "@/server/db/schema";
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

/** The category, if it belongs to the user (archived ones included). */
async function ownedCategory(userId: string, categoryId: string) {
  const [row] = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
    })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Categoria");
  return row;
}

export type CategoryPatch = {
  name?: string;
  icon?: string;
  color?: ColorToken;
};

export async function updateCategory(
  userId: string,
  categoryId: string,
  patch: CategoryPatch,
): Promise<void> {
  const row = await ownedCategory(userId, categoryId);
  const name = patch.name?.trim();
  if (name !== undefined) {
    if (name.length < 1 || name.length > 40) {
      throw new DomainError("Use um nome de 1 a 40 caracteres.");
    }
    // Names are unique per level, archived categories included (the unique
    // key is NULLS NOT DISTINCT), so a clash gets a readable message.
    const [clash] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.name, name),
          ne(categories.id, categoryId),
          row.parentId === null
            ? isNull(categories.parentId)
            : eq(categories.parentId, row.parentId),
        ),
      )
      .limit(1);
    if (clash) throw new DomainError("Já existe uma categoria com esse nome.");
  }
  const changes = {
    ...(name !== undefined ? { name } : {}),
    ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
  };
  if (Object.keys(changes).length === 0) return;
  await db
    .update(categories)
    .set(changes)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
}

/**
 * Archives or restores a category. Archived categories leave the pickers and
 * the budgets; past entries keep pointing at them, so nothing is lost.
 */
export async function setCategoryArchived(
  userId: string,
  categoryId: string,
  archived: boolean,
): Promise<void> {
  await ownedCategory(userId, categoryId);
  await db
    .update(categories)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
}
