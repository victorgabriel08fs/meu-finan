// Feature flags on the server (doc 01 §11.10): the effective values for a
// person, from the stored values and the registry (src/lib/flags). Read fresh
// on every request, so a change in Administração › Flags counts on the next
// request; within a request, React `cache` reads them once.
import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { defaultFlags, type FlagKey, type Flags } from "@/lib/flags/registry";
import { resolveFlags } from "@/lib/flags/resolve";
import { getSession } from "@/server/dal";
import { db, type Executor } from "@/server/db/client";
import { featureFlagOverrides, featureFlags } from "@/server/db/schema";

/** Effective flags of a person, straight from the database (not memoised). */
export async function loadFlags(
  userId: string,
  executor: Executor = db,
): Promise<Flags> {
  const [globals, overrides] = await Promise.all([
    executor
      .select({ key: featureFlags.key, enabled: featureFlags.enabled })
      .from(featureFlags),
    executor
      .select({
        key: featureFlagOverrides.key,
        enabled: featureFlagOverrides.enabled,
      })
      .from(featureFlagOverrides)
      .where(eq(featureFlagOverrides.userId, userId)),
  ]);
  return resolveFlags(globals, overrides);
}

/** Effective flags of a person, memoised for the request. */
export const getFlags = cache((userId: string) => loadFlags(userId));

export async function isFlagEnabled(
  key: FlagKey,
  userId: string,
): Promise<boolean> {
  return (await getFlags(userId))[key];
}

/**
 * The signed-in person's flags for FlagsProvider (the app shell creates the
 * promise without awaiting it; Client Components read it inside <Suspense>).
 * Signed out: the registry defaults.
 */
export async function getViewerFlags(): Promise<Flags> {
  const session = await getSession();
  return session ? getFlags(session.user.id) : defaultFlags();
}
