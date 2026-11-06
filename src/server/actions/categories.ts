"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createCategory } from "@/server/domain/categories";
import {
  setCategoryArchived,
  updateCategory,
} from "@/server/domain/category-admin";
import { getUserContext } from "@/server/domain/context";
import { authAction } from "@/server/safe-action";
import { colorToken, iconName, idSchema } from "./schemas";

const name = z
  .string()
  .trim()
  .min(1, { error: "Informe um nome." })
  .max(40, { error: "Use até 40 caracteres." });

/** null or absent: a main category; an id: a subcategory of it. */
const parentId = idSchema.nullable().optional();

/** A new category or subcategory (Ajustes › Categorias). */
export const createCategoryAction = authAction
  .inputSchema(
    z.object({
      kind: z.enum(["income", "expense"]),
      name,
      icon: iconName,
      color: colorToken,
      parentId,
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    const id = await createCategory(user.id, parsedInput);
    refresh();
    return { id };
  });

/**
 * Rename, recolor, change the icon or move a category into a main category
 * (parentId) or back to the top level (parentId: null).
 */
export const updateCategoryAction = authAction
  .inputSchema(
    z.object({
      id: idSchema,
      name: name.optional(),
      icon: iconName.optional(),
      color: colorToken.optional(),
      parentId,
    }),
  )
  .action(async ({ parsedInput: { id, ...patch }, ctx: { user } }) => {
    await updateCategory(await getUserContext(user.id), id, patch);
    refresh();
  });

/**
 * Archive (archived: true) or restore (archived: false) a category, with the
 * subcategories that go along; returns what changed for the toast.
 */
export const setCategoryArchivedAction = authAction
  .inputSchema(z.object({ id: idSchema, archived: z.boolean() }))
  .action(async ({ parsedInput: { id, archived }, ctx: { user } }) => {
    const result = await setCategoryArchived(user.id, id, archived);
    refresh();
    return result;
  });
