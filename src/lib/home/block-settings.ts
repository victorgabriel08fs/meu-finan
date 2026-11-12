// Settings of single blocks of the Início (doc 02 §6.3). The account stores
// only what the person changed (user_settings.home_block_settings, null =
// never changed); these read it defensively, since a value saved by an older
// version, or by hand, must never break the Início. Pure functions, no I/O.
import type { StoredHomeBlockSettings } from "@/server/db/schema";

export type { StoredHomeBlockSettings };

/** Most account ids kept as hidden (far more accounts than anyone has). */
export const MAX_HIDDEN_ACCOUNTS = 100;
/** Longer than any id (uuids have 36 characters): ignored. */
const MAX_ID_LENGTH = 64;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The accounts the person hid from "Quanto dá para gastar por dia": strings
 * only, once each, at most 100. Anything else reads as none hidden. The
 * hidden ones are kept (not the shown ones), so a new account shows up on
 * its own.
 */
export function resolveDailySpendHidden(stored: unknown): string[] {
  if (!isObject(stored)) return [];
  const block = stored["daily-spend"];
  if (!isObject(block)) return [];
  const ids = block.hiddenAccountIds;
  if (!Array.isArray(ids)) return [];
  const hidden: string[] = [];
  for (const id of ids) {
    if (hidden.length >= MAX_HIDDEN_ACCOUNTS) break;
    if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH)
      continue;
    if (!hidden.includes(id)) hidden.push(id);
  }
  return hidden;
}

/**
 * The accounts that get a line under each day of "Quanto dá para gastar por
 * dia", in the order given: none with fewer than two accounts to spend from
 * (the total says it all), otherwise those the person did not hide.
 */
export function dailySpendLineIds(
  stored: unknown,
  spendableIds: readonly string[],
): string[] {
  if (spendableIds.length < 2) return [];
  const hidden = new Set(resolveDailySpendHidden(stored));
  return spendableIds.filter((id) => !hidden.has(id));
}
