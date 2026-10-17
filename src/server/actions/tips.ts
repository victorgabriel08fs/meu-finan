"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isTipId, TIP_IDS } from "@/lib/tips";
import { markTipsSeen, resetTips, setTipsOff } from "@/server/domain/tips";
import { authAction } from "@/server/safe-action";

/**
 * Tips and novidades (doc 02 §6.16). The browser applies each change to its
 * tips store right away (src/stores/tips.ts), so marking seen and turning tips
 * off skip refresh(): re-rendering the page would recompute it for nothing,
 * and the next page load reads the database anyway. "Rever dicas" refreshes,
 * so the snapshot in the layout matches the reset.
 */

const tipId = z
  .string()
  .refine(isTipId, { error: "Dica desconhecida. Recarregue a página." });

export const markTipsSeenAction = authAction
  .inputSchema(z.object({ ids: z.array(tipId).min(1).max(TIP_IDS.length) }))
  .action(async ({ parsedInput: { ids }, ctx: { user } }) => {
    await markTipsSeen(user.id, ids);
  });

/** "Não mostrar mais dicas" (off: true), or tips back on (Ajustes). */
export const setTipsOffAction = authAction
  .inputSchema(z.object({ off: z.boolean() }))
  .action(async ({ parsedInput: { off }, ctx: { user } }) => {
    await setTipsOff(user.id, off);
  });

/** "Rever dicas": the basics show again; novidades stay read. */
export const resetTipsAction = authAction.action(async ({ ctx: { user } }) => {
  await resetTips(user.id);
  refresh();
});
