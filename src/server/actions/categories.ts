"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createCategory } from "@/server/domain/categories";
import {
  reorderCategories,
  setCategoryArchived,
  updateCategory,
} from "@/server/domain/category-admin";
import { mergeCategories } from "@/server/domain/category-moves";
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
 * subcategories that go along; with `moveTo`, archiving also passes its
 * entries, recurrences, rules and budgets to that category (no Desfazer).
 * Returns what changed for the toast.
 */
export const setCategoryArchivedAction = authAction
  .inputSchema(
    z
      .object({
        id: idSchema,
        archived: z.boolean(),
        moveTo: idSchema.optional(),
      })
      .refine((input) => input.archived || input.moveTo === undefined, {
        error: "Só dá para passar os lançamentos ao arquivar.",
        path: ["moveTo"],
      }),
  )
  .action(async ({ parsedInput: { id, archived, moveTo }, ctx: { user } }) => {
    const result = await setCategoryArchived(user.id, id, archived, moveTo);
    refresh();
    return result;
  });

/** "Mesclar com outra": everything of `id` goes into `into`; `id` is archived. */
export const mergeCategoriesAction = authAction
  .inputSchema(z.object({ id: idSchema, into: idSchema }))
  .action(async ({ parsedInput: { id, into }, ctx: { user } }) => {
    const result = await mergeCategories(user.id, id, into);
    refresh();
    return result;
  });

/** "Mudar a ordem": every active category of the type, in the new order. */
export const reorderCategoriesAction = authAction
  .inputSchema(
    z.object({
      kind: z.enum(["income", "expense"]),
      ids: z.array(idSchema).min(1).max(300),
    }),
  )
  .action(async ({ parsedInput: { kind, ids }, ctx: { user } }) => {
    await reorderCategories(user.id, kind, ids);
    refresh();
  });
