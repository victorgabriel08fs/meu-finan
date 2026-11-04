// Owner preferences kept on the account (user_settings). The theme is the
// only one read outside getUserContext: the app shell needs it on its own;
// the Início reads its blocks on its own too.
import { eq } from "drizzle-orm";
import { type HomeLayout, resolveHomeLayout } from "@/lib/home/layout";
import { DEFAULT_THEME } from "@/lib/theme";
import { db, type Executor } from "@/server/db/client";
import {
  type StoredHomeLayout,
  type Theme,
  userSettings,
} from "@/server/db/schema";

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

/**
 * The person's Início (doc 02 §6.3): what they saved, merged with the block
 * catalog; the app's default when they never changed it. `today` (the
 * person's) marks the recent blocks "Novo".
 */
export async function getHomeLayout(
  userId: string,
  { today, executor = db }: { today?: string; executor?: Executor } = {},
): Promise<HomeLayout> {
  const [row] = await executor
    .select({ homeLayout: userSettings.homeLayout })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return resolveHomeLayout(row?.homeLayout ?? null, { today });
}

/**
 * Saves the blocks of the Início on the account, so every device shows the
 * same; null goes back to the app's default ("Restaurar padrão").
 */
export async function setHomeLayout(
  userId: string,
  homeLayout: StoredHomeLayout | null,
  executor: Executor = db,
): Promise<void> {
  await executor
    .insert(userSettings)
    .values({ userId, homeLayout })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { homeLayout, updatedAt: new Date() },
    });
}
