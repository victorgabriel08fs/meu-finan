"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { THEMES } from "@/server/db/schema";
import { setThemePreference } from "@/server/domain/preferences";
import { authAction } from "@/server/safe-action";

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
