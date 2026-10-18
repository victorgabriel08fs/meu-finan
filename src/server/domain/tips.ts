// Usage tips and novidades per user (doc 02 §6.16): the snapshot the browser
// starts from, and the writes behind "Entendi", "Pular dicas", "Não mostrar
// mais dicas" and "Rever dicas". Valid ids come from the registry in
// src/lib/tips; anything else is ignored.
import { and, eq, isNull, min, notInArray } from "drizzle-orm";
import type { UserRole } from "@/lib/admin/roles";
import { iso, localDateIn } from "@/lib/finance";
import type { Flags } from "@/lib/flags/registry";
import {
  isTipId,
  NOVIDADE_IDS,
  TIP_FLAG_KEYS,
  type TipContext,
  type TipsSnapshot,
} from "@/lib/tips";
import { db, type Executor } from "@/server/db/client";
import {
  accessLinks,
  finAccounts,
  passkey,
  user,
  userTips,
} from "@/server/db/schema";
import { getUserContext } from "./context";

/** Row that turns every balloon off ("Não mostrar mais dicas"). Not a tip id. */
export const TIPS_OFF_ROW = "*";

/**
 * Who is looking, as the request already knows it: the session's role and
 * the effective feature flags (`getFlags` in src/server/flags). Callers pass
 * it in, so this module stays clear of the request-bound server code
 * (scripts/demo.ts loads it under tsx).
 */
export type TipViewer = { role: UserRole; flags: Flags };

/**
 * The facts tip conditions read (TipContext): accounts and passkeys from
 * single-table queries, the role and the flags tips ask about from the viewer.
 */
export async function getTipContext(
  userId: string,
  viewer: TipViewer,
  executor: Executor = db,
): Promise<TipContext> {
  const [account, key] = await Promise.all([
    executor
      .select({ id: finAccounts.id })
      .from(finAccounts)
      .where(
        and(eq(finAccounts.userId, userId), isNull(finAccounts.archivedAt)),
      )
      .limit(1),
    executor
      .select({ id: passkey.id })
      .from(passkey)
      .where(eq(passkey.userId, userId))
      .limit(1),
  ]);
  return {
    hasAccounts: account.length > 0,
    hasPasskey: key.length > 0,
    role: viewer.role,
    flags: TIP_FLAG_KEYS.filter((key) => viewer.flags[key]),
  };
}

type SnapshotOptions = {
  executor?: Executor;
  /** IANA zone for the day the account came into use; defaults to the user's. */
  timeZone?: string;
};

/** Everything the browser needs to pick tips, read once per page load. */
export async function getTipsSnapshot(
  userId: string,
  viewer: TipViewer,
  { executor = db, timeZone }: SnapshotOptions = {},
): Promise<TipsSnapshot> {
  const [owner, joined, rows, context, zone] = await Promise.all([
    executor
      .select({ createdAt: user.createdAt })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    executor
      .select({ usedAt: min(accessLinks.usedAt) })
      .from(accessLinks)
      .where(
        and(eq(accessLinks.userId, userId), eq(accessLinks.purpose, "invite")),
      ),
    executor
      .select({ tipId: userTips.tipId })
      .from(userTips)
      .where(eq(userTips.userId, userId)),
    getTipContext(userId, viewer, executor),
    timeZone ?? getUserContext(userId).then((ctx) => ctx.timeZone),
  ]);
  // An invited person starts using the app when they accept the invite, not
  // when an administrator created the account; reset links do not count.
  // Without an invite (the first administrator), the account's creation.
  const startedAt = joined[0]?.usedAt ?? owner[0]?.createdAt;
  return {
    seen: rows.map((row) => row.tipId).filter(isTipId),
    off: rows.some((row) => row.tipId === TIPS_OFF_ROW),
    createdOn: startedAt ? iso(localDateIn(startedAt, zone)) : null,
    context,
  };
}

/** Whether the user turned the balloons off ("Não mostrar mais dicas"). */
export async function getTipsOff(
  userId: string,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .select({ tipId: userTips.tipId })
    .from(userTips)
    .where(and(eq(userTips.userId, userId), eq(userTips.tipId, TIPS_OFF_ROW)))
    .limit(1);
  return rows.length > 0;
}

/** Marks tips of the registry as seen; unknown ids are dropped. Idempotent. */
export async function markTipsSeen(
  userId: string,
  ids: readonly string[],
  executor: Executor = db,
): Promise<void> {
  const known = [...new Set(ids.filter(isTipId))];
  if (known.length === 0) return;
  await executor
    .insert(userTips)
    .values(known.map((tipId) => ({ userId, tipId })))
    .onConflictDoNothing();
}

/** "Não mostrar mais dicas" (off: true), or tips back on. */
export async function setTipsOff(
  userId: string,
  off: boolean,
  executor: Executor = db,
): Promise<void> {
  if (off) {
    await executor
      .insert(userTips)
      .values({ userId, tipId: TIPS_OFF_ROW })
      .onConflictDoNothing();
    return;
  }
  await executor
    .delete(userTips)
    .where(and(eq(userTips.userId, userId), eq(userTips.tipId, TIPS_OFF_ROW)));
}

/**
 * "Rever dicas": the basics show again and tips are back on. Novidades stay
 * read: they are news, not lessons.
 */
export async function resetTips(
  userId: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .delete(userTips)
    .where(
      and(
        eq(userTips.userId, userId),
        notInArray(userTips.tipId, [...NOVIDADE_IDS]),
      ),
    );
}
