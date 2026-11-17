"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/server/domain/context";
import { interpretEntryText, TEXT_ENTRY_OFF } from "@/server/domain/entry-text";
import { ActionError, flaggedAction } from "@/server/safe-action";
import { limitUsage } from "@/server/security/limits";

/**
 * Reads the phrase of the "Nova transação" text field (flag
 * `lancamento_por_texto`) and returns the fields to fill. Nothing is sent by
 * the client but the text: accounts, categories and tags are the person's
 * own, found on the server.
 */
export const interpretEntryTextAction = flaggedAction(
  "lancamento_por_texto",
  TEXT_ENTRY_OFF,
)
  .inputSchema(
    z.object({
      text: z
        .string()
        .trim()
        .min(1, { error: "Escreva o lançamento." })
        .max(200, { error: "Use até 200 caracteres." }),
      kind: z.enum(["expense", "income"]),
    }),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    if (!(await limitUsage("entryText", user.id)).ok) {
      throw new ActionError(
        "Muitos pedidos seguidos. Espere um minuto e tente de novo.",
      );
    }
    const ctx = await getUserContext(user.id);
    const result = await interpretEntryText(ctx, parsedInput);
    if (result.tagsChanged) refresh();
    return result;
  });
