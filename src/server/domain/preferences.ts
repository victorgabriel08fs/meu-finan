// Owner preferences kept on the account (user_settings). The theme is the
// only one read outside getUserContext: the app shell needs it on its own;
// the Início reads its blocks on its own too, and the daily job the notices.
import { and, eq, inArray, sql } from "drizzle-orm";
import { type HomeLayout, resolveHomeLayout } from "@/lib/home/layout";
import {
  type NotificationPreferences,
  resolveNotificationPreferences,
} from "@/lib/notifications/preferences";
import { DEFAULT_THEME } from "@/lib/theme";
import { db, type Executor } from "@/server/db/client";
import {
  finAccounts,
  type StoredHomeBlockSettings,
  type StoredHomeLayout,
  type Theme,
  userSettings,
} from "@/server/db/schema";
import { notFound } from "./errors";

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

/**
 * What the person changed in single blocks of the Início, as stored (null:
 * nothing); src/lib/home/block-settings.ts reads it.
 */
export async function getHomeBlockSettings(
  userId: string,
  executor: Executor = db,
): Promise<StoredHomeBlockSettings | null> {
  const [row] = await executor
    .select({ settings: userSettings.homeBlockSettings })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row?.settings ?? null;
}

/**
 * The accounts hidden from "Quanto dá para gastar por dia" ("Contas no
 * bloco"), on the account so every device shows the same. Every id must be
 * one of the person's accounts (archived ones too: they may come back);
 * anyone else's is refused. Merged into the column, so the other blocks'
 * settings stay.
 */
export async function setDailySpendHidden(
  userId: string,
  hiddenAccountIds: readonly string[],
  executor: Executor = db,
): Promise<void> {
  const ids = [...new Set(hiddenAccountIds)];
  if (ids.length > 0) {
    const owned = await executor
      .select({ id: finAccounts.id })
      .from(finAccounts)
      .where(and(eq(finAccounts.userId, userId), inArray(finAccounts.id, ids)));
    if (owned.length !== ids.length) throw notFound("Conta");
  }
  const block = { hiddenAccountIds: ids };
  await executor
    .insert(userSettings)
    .values({ userId, homeBlockSettings: { "daily-spend": block } })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        homeBlockSettings: sql`coalesce(${userSettings.homeBlockSettings}, '{}'::jsonb) || jsonb_build_object('daily-spend', ${JSON.stringify(block)}::jsonb)`,
        updatedAt: new Date(),
      },
    });
}

/**
 * The notices the person chose (Ajustes › Notificações › Avisos, doc 02
 * §6.14); the defaults when they never changed them.
 */
export async function getNotificationPreferences(
  userId: string,
  executor: Executor = db,
): Promise<NotificationPreferences> {
  const [row] = await executor
    .select({ notificationPrefs: userSettings.notificationPrefs })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return resolveNotificationPreferences(row?.notificationPrefs ?? null);
}

/** Saves the whole choice of notices on the account. */
export async function setNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
  executor: Executor = db,
): Promise<void> {
  const notificationPrefs = {
    events: { ...preferences.events },
    billsLeadDays: preferences.billsLeadDays,
    showAmounts: preferences.showAmounts,
  };
  await executor
    .insert(userSettings)
    .values({ userId, notificationPrefs })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { notificationPrefs, updatedAt: new Date() },
    });
}
