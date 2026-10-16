"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  setCategoryArchived,
  updateCategory,
} from "@/server/domain/category-admin";
import { authAction } from "@/server/safe-action";
import { colorToken, iconName, idSchema } from "./schemas";

const name = z
  .string()
  .trim()
  .min(1, { error: "Informe um nome." })
  .max(40, { error: "Use até 40 caracteres." });

/** Rename, recolor or change the icon of a category (Ajustes › Categorias). */
export const updateCategoryAction = authAction
  .inputSchema(
    z.object({
      id: idSchema,
      name: name.optional(),
      icon: iconName.optional(),
      color: colorToken.optional(),
    }),
  )
  .action(async ({ parsedInput: { id, ...patch }, ctx: { user } }) => {
    await updateCategory(user.id, id, patch);
    refresh();
  });

/** Archive (archived: true) or restore (archived: false) a category. */
export const setCategoryArchivedAction = authAction
  .inputSchema(z.object({ id: idSchema, archived: z.boolean() }))
  .action(async ({ parsedInput: { id, archived }, ctx: { user } }) => {
    await setCategoryArchived(user.id, id, archived);
    refresh();
  });
