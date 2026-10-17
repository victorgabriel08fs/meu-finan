// Owner preferences kept on the account (user_settings). The theme is the
// only one read outside getUserContext: the app shell needs it on its own.
import { eq } from "drizzle-orm";
import { DEFAULT_THEME } from "@/lib/theme";
import { db, type Executor } from "@/server/db/client";
import { type Theme, userSettings } from "@/server/db/schema";

/** The account's theme (doc 02 §6.14); the default when there is no row yet. */
export async function getThemePreference(
  userId: string,
  executor: Executor = db,
): Promise<Theme> {
  const [row] = await executor
    .select({ theme: userSettings.theme })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row?.theme ?? DEFAULT_THEME;
}

/**
 * Saves the theme on the account, so every device follows it. Upserts: the
 * row normally exists since the first access (ensureOwnerDefaults).
 */
export async function setThemePreference(
  userId: string,
  theme: Theme,
  executor: Executor = db,
): Promise<void> {
  await executor
    .insert(userSettings)
    .values({ userId, theme })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { theme, updatedAt: new Date() },
    });
}
