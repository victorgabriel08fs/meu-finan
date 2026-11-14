"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ensureTag, renameTag, setTagArchived } from "@/server/domain/tags";
import { authAction } from "@/server/safe-action";
import { idSchema, tagName } from "./schemas";

/**
 * A new tag. Ajustes › Etiquetas refuses a name already in use; the picker
 * (`reuse`) just takes that tag. A name of an archived tag restores it.
 */
export const createTagAction = authAction
  .inputSchema(z.object({ name: tagName, reuse: z.boolean().optional() }))
  .action(async ({ parsedInput: { name, reuse }, ctx: { user } }) => {
    const tag = await ensureTag(user.id, name, { failIfActive: !reuse });
    refresh();
    return tag;
  });

export const renameTagAction = authAction
  .inputSchema(z.object({ id: idSchema, name: tagName }))
  .action(async ({ parsedInput: { id, name }, ctx: { user } }) => {
    const result = await renameTag(user.id, id, name);
    refresh();
    return result;
  });

/** Archive (or restore, the toast's "Desfazer") a tag; entries keep it. */
export const setTagArchivedAction = authAction
  .inputSchema(z.object({ id: idSchema, archived: z.boolean() }))
  .action(async ({ parsedInput: { id, archived }, ctx: { user } }) => {
    const result = await setTagArchived(user.id, id, archived);
    refresh();
    return result;
  });
