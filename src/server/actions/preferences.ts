"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { MOVABLE_HOME_BLOCK_IDS } from "@/lib/home/blocks";
import { THEMES } from "@/server/db/schema";
import { setHomeLayout, setThemePreference } from "@/server/domain/preferences";
import { authAction, flaggedAction } from "@/server/safe-action";

/**
 * Theme chosen in Ajustes or in a quick toggle (doc 02 §6.14). The device
 * applies it at once (next-themes, localStorage); this keeps it on the
 * account, so a new device adopts it after signing in.
 */
export const setThemeAction = authAction
  .inputSchema(z.object({ theme: z.enum(THEMES) }))
  .action(async ({ parsedInput: { theme }, ctx: { user } }) => {
    await setThemePreference(user.id, theme);
    refresh();
  });

const homeLayoutInput = z.strictObject({
  /**
   * The movable blocks in the chosen order (the Saldo is always first, so it
   * is never sent). A subset is fine: blocks left out come back hidden and
   * new. Null restores the app's default.
   */
  blocks: z
    .array(
      z.strictObject({
        id: z.enum(MOVABLE_HOME_BLOCK_IDS),
        visible: z.boolean(),
      }),
    )
    .max(MOVABLE_HOME_BLOCK_IDS.length)
    .refine(
      (blocks) =>
        new Set(blocks.map((block) => block.id)).size === blocks.length,
      "Bloco repetido.",
    )
    .nullable(),
});

/**
 * Blocks of the Início chosen in "Personalizar o Início" (doc 02 §6.3), kept
 * on the account so every device shows the same. Behind the
 * inicio_personalizavel flag, refused on the server when it is off. The page
 * reads the choice on every request, so `refresh()` is all it takes.
 */
export const saveHomeLayoutAction = flaggedAction(
  "inicio_personalizavel",
  "Personalizar o Início não está disponível na sua conta.",
)
  .inputSchema(homeLayoutInput)
  .action(async ({ parsedInput: { blocks }, ctx: { user } }) => {
    await setHomeLayout(user.id, blocks);
    refresh();
  });
