/**
 * Usage tips ("primeiros passos") and announcements ("novidades"): the shapes
 * of the registry in ./registry and of the per-user state the selection in
 * ./select works on. Pure data, shared by the server and the browser.
 */
import type { UserRole } from "@/lib/admin/roles";
import type { FlagKey } from "@/lib/flags/registry";

/**
 * - `primeiros-passos`: for everyone, the first time they reach the screen.
 * - `novidade`: announces something new, so only accounts created before its
 *   `since` date get it (a newer account never knew the app without it).
 */
export type TipKind = "primeiros-passos" | "novidade";

/** Role of the signed-in user (src/lib/admin/roles). */
export type TipRole = UserRole;

/** Icon of a novidade in Ajustes › Novidades (mapped to Lucide there). */
export type TipIcon =
  | "target"
  | "chart"
  | "file-up"
  | "smartphone"
  | "sparkles";

/** Side of the anchor the balloon prefers (it flips when there is no room). */
export type TipSide = "top" | "bottom" | "left" | "right";

/**
 * What a tip needs from the user to make sense. Every key that is set must
 * match (AND); a tip without `when` always applies.
 */
export type TipCondition = {
  /** The user has (true) or has no (false) active account. */
  hasAccounts?: boolean;
  /** The user has (true) or has no (false) passkey. */
  hasPasskey?: boolean;
  /** Only for these roles; never while the role is unknown (null). */
  roles?: readonly TipRole[];
  /**
   * Only while this feature flag (src/lib/flags) is on for the user: a tip
   * about a flagged feature never points at it while it is off.
   */
  flag?: FlagKey;
};

/**
 * The few facts about the user that conditions read, resolved on the server
 * (src/server/domain/tips.ts). Extend it together with TipCondition.
 */
export type TipContext = {
  hasAccounts: boolean;
  hasPasskey: boolean;
  /**
   * The user's role. null only before the server's snapshot arrives (the
   * tips store's empty state), when no role-bound tip shows.
   */
  role: TipRole | null;
  /** Feature flags on for the user, among those tips ask about (TIP_FLAG_KEYS). */
  flags: readonly FlagKey[];
};

export type Tip = {
  /**
   * Stable id, stored per user once the tip is seen: never rename or reuse
   * one. Lowercase words joined by hyphens.
   */
  id: string;
  kind: TipKind;
  /**
   * Screens where it shows, as path patterns: "/inicio", "/planejar/metas/:id"
   * (one segment), "/relatorios/*" (anything below). Empty: only listed in
   * Ajustes › Novidades.
   */
  routes: readonly string[];
  /**
   * The `data-tip` value of the element the balloon points at, or null for a
   * novidade without a place on screen. A tip whose anchor is not on screen
   * is skipped (and stays unseen).
   */
  anchor: string | null;
  /** Short, in pt-BR (doc 02 §10). */
  title: string;
  /** One or two short sentences, in pt-BR. */
  body: string;
  /** Body for the desktop layout (sidebar, keyboard), when it differs. */
  desktopBody?: string;
  /** Day it reached the app, YYYY-MM-DD (São Paulo). */
  since: string;
  /** Position in its screen's sequence: lower first. */
  order: number;
  when?: TipCondition;
  /**
   * novidade only: primeiros-passos tips it stands in for. Accounts old enough
   * to get the novidade never see those (they already know the screen).
   */
  replaces?: readonly string[];
  /** Sides to try first; defaults to below, above, right, left. */
  placement?: readonly TipSide[];
  /** novidade: icon in Ajustes › Novidades. */
  icon?: TipIcon;
  /** novidade: link in Ajustes › Novidades ("Ver relatórios"). */
  link?: { href: string; label: string };
};

/** What the server knows about a user's tips, handed to the browser once. */
export type TipsSnapshot = {
  /** Ids of the registry the user has seen. */
  seen: readonly string[];
  /** "Não mostrar mais dicas": no balloon at all. */
  off: boolean;
  /** Day the account was created, YYYY-MM-DD in the user's time zone. */
  createdOn: string | null;
  context: TipContext;
};
