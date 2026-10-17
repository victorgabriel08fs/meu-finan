import { MAX_TIPS_PER_SCREEN, TIPS } from "./registry";
import type { Tip, TipCondition, TipContext } from "./types";

/**
 * Which tips to show, and which novidades are unread. Pure: the state comes
 * in as arguments (the server's snapshot plus what the browser marked since),
 * and the registry can be swapped for a fixture.
 */

export type TipState = {
  seen: ReadonlySet<string>;
  /** "Não mostrar mais dicas". */
  off: boolean;
  /** Day the account was created, YYYY-MM-DD; null when unknown. */
  createdOn: string | null;
  context: TipContext;
};

/** Pathname without a trailing slash (the root stays "/"). */
function trimSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Whether a pathname matches a route pattern: literal segments, `:name` for
 * exactly one segment, and a final `*` for one or more segments.
 */
export function matchRoute(pattern: string, pathname: string): boolean {
  const want = trimSlash(pattern).split("/");
  const have = trimSlash(pathname.split(/[?#]/)[0] ?? "").split("/");
  for (let index = 0; index < want.length; index++) {
    const segment = want[index];
    if (segment === "*" && index === want.length - 1) {
      return have.length > index && have.slice(index).every(Boolean);
    }
    const actual = have[index];
    if (actual === undefined) return false;
    if (segment?.startsWith(":")) {
      if (!actual) return false;
    } else if (segment !== actual) {
      return false;
    }
  }
  return have.length === want.length;
}

/** Every key the condition sets must match the context. */
export function meetsCondition(
  when: TipCondition | undefined,
  context: TipContext,
): boolean {
  if (!when) return true;
  if (
    when.hasAccounts !== undefined &&
    when.hasAccounts !== context.hasAccounts
  )
    return false;
  if (when.hasPasskey !== undefined && when.hasPasskey !== context.hasPasskey)
    return false;
  if (
    when.roles &&
    (context.role === null || !when.roles.includes(context.role))
  )
    return false;
  if (when.flag !== undefined && !context.flags.includes(when.flag))
    return false;
  return true;
}

/**
 * A primeiros-passos tip is for everyone; a novidade only for accounts created
 * before its date (an unknown creation date never gets one).
 */
export function isForAccount(tip: Tip, createdOn: string | null): boolean {
  if (tip.kind === "primeiros-passos") return true;
  return createdOn !== null && createdOn < tip.since;
}

/** The tip applies to this user at all (account age and condition). */
function applies(tip: Tip, state: TipState): boolean {
  return (
    isForAccount(tip, state.createdOn) &&
    meetsCondition(tip.when, state.context)
  );
}

/** Ids that some novidade the user gets stands in for. */
function replacedIds(state: TipState, tips: readonly Tip[]): Set<string> {
  const replaced = new Set<string>();
  for (const tip of tips) {
    if (tip.kind !== "novidade" || !applies(tip, state)) continue;
    for (const id of tip.replaces ?? []) replaced.add(id);
  }
  return replaced;
}

const KIND_RANK = { "primeiros-passos": 0, novidade: 1 } as const;

function bySequence(a: Tip, b: Tip): number {
  return (
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    a.order - b.order ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

type SelectOptions = {
  /** Whether the anchor is on screen now; tips that fail it are skipped. */
  isVisible?: (anchor: string) => boolean;
  /** Longest sequence (default MAX_TIPS_PER_SCREEN). */
  max?: number;
  tips?: readonly Tip[];
};

/**
 * The tips to show on this screen now, in order: unseen, for this account,
 * meeting their condition, not replaced by a novidade, with an anchor on
 * screen. Basics come before novidades. Nothing while tips are off.
 */
export function selectTips(
  pathname: string,
  state: TipState,
  { isVisible, max = MAX_TIPS_PER_SCREEN, tips = TIPS }: SelectOptions = {},
): Tip[] {
  if (state.off || max <= 0) return [];
  const replaced = replacedIds(state, tips);
  const chosen: Tip[] = [];
  for (const tip of [...tips].sort(bySequence)) {
    if (chosen.length >= max) break;
    if (tip.anchor === null || state.seen.has(tip.id) || replaced.has(tip.id))
      continue;
    if (!tip.routes.some((route) => matchRoute(route, pathname))) continue;
    if (!applies(tip, state)) continue;
    if (isVisible && !isVisible(tip.anchor)) continue;
    chosen.push(tip);
  }
  return chosen;
}

export type NewsItem = { tip: Tip; unread: boolean };

/**
 * Ajustes › Novidades e dicas: every novidade whose condition holds, newest
 * first, flagged unread when the account predates it and it was not seen. A
 * newer account still finds the list as the app's history, all read.
 */
export function newsFeed(
  state: Pick<TipState, "seen" | "createdOn" | "context">,
  tips: readonly Tip[] = TIPS,
): NewsItem[] {
  return tips
    .filter(
      (tip) =>
        tip.kind === "novidade" && meetsCondition(tip.when, state.context),
    )
    .sort(
      (a, b) =>
        (a.since < b.since ? 1 : a.since > b.since ? -1 : 0) ||
        bySequence(a, b),
    )
    .map((tip) => ({
      tip,
      unread: isForAccount(tip, state.createdOn) && !state.seen.has(tip.id),
    }));
}

/** Ids of the unread novidades (the dot on the avatar and on Ajustes). */
export function unreadNewsIds(
  state: Pick<TipState, "seen" | "createdOn" | "context">,
  tips: readonly Tip[] = TIPS,
): string[] {
  return newsFeed(state, tips)
    .filter((item) => item.unread)
    .map((item) => item.tip.id);
}
