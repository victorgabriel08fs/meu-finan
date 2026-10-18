/**
 * Theme preference (doc 02 §3.11, §6.14): dark by default. The device keeps
 * its choice in localStorage, which next-themes applies to <html data-theme>
 * with an inline script before the first paint; the account keeps it in
 * user_settings.theme, so a new device adopts it after signing in. Shared by
 * server and client code, so it imports nothing.
 */

/** The choices, in display order: Escuro · Claro · Sistema. */
export const THEME_CHOICES = ["dark", "light", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** A theme that can actually be on screen ("system" resolves to one). */
export type ResolvedTheme = Exclude<ThemeChoice, "system">;

export const DEFAULT_THEME = "dark" satisfies ThemeChoice;

export const THEME_LABELS: Record<ThemeChoice, string> = {
  dark: "Escuro",
  light: "Claro",
  system: "Sistema",
};

/** localStorage key of this device's choice (next-themes `storageKey`). */
export const THEME_STORAGE_KEY = "meu-finan:tema";

/**
 * localStorage key of the account's theme as this device last saw or saved
 * it, stored as "{userId}:{theme}" (syncedTheme) because a device can be
 * shared by several accounts. The account's theme is adopted only when it
 * differs from this value, i.e. on a new device, after a change made on
 * another one, or when another account synced this device last.
 */
export const THEME_SYNCED_KEY = "meu-finan:tema-da-conta";

/** The value of THEME_SYNCED_KEY for an account's theme. */
export function syncedTheme(userId: string, theme: ThemeChoice): string {
  return `${userId}:${theme}`;
}

/**
 * Page background of each theme (= --bg): <meta name="theme-color">, the
 * manifest and the splash screen of the installed app.
 */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#0B0D10",
  light: "#F4F5F7",
};

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return (
    typeof value === "string" &&
    (THEME_CHOICES as readonly string[]).includes(value)
  );
}

/**
 * Whether a device adopts the account's theme. Only when it differs from the
 * value the device last saw or saved (`synced`, see THEME_SYNCED_KEY): a new
 * device has none, a change made on another device shows up as a different
 * theme, and another account that used this device last as a different id,
 * even with the same theme. Never while a save from this device is on its
 * way, or a stale value from before it would undo the user's choice.
 */
export function shouldAdoptAccountTheme({
  userId,
  saved,
  synced,
  pending,
}: {
  userId: string;
  saved: ThemeChoice;
  synced: string | null;
  pending: boolean;
}): boolean {
  return !pending && synced !== syncedTheme(userId, saved);
}

/**
 * The theme this device shows, as next-themes resolves it: the saved choice
 * or the default, "system" through prefers-color-scheme. Leaves "dark" or
 * "light" in `t`; throws where storage is blocked (the callers catch).
 */
const RESOLVE_THEME = `var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})||${JSON.stringify(DEFAULT_THEME)};if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(t!=="light")t="dark";`;

/**
 * Inline in <head>: puts the saved theme on <html data-theme> before anything
 * is painted. The server renders the default (dark), so this only changes
 * something for Claro or Sistema; next-themes' own script, in <body>, sets
 * the same value a moment later.
 */
export const THEME_HEAD_SCRIPT = `try{${RESOLVE_THEME}var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t}catch(e){}`;

/**
 * Inline at the start of <body>, after the viewport tags of <head>: points
 * <meta name="theme-color"> and <meta name="color-scheme"> at the saved
 * theme, so the browser and status bars match the page from the start.
 */
export const THEME_META_SCRIPT = `try{${RESOLVE_THEME}var c=t==="light"?${JSON.stringify(
  THEME_COLORS.light,
)}:${JSON.stringify(THEME_COLORS.dark)};document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c)});var s=document.querySelector('meta[name="color-scheme"]');if(s)s.setAttribute("content",t)}catch(e){}`;
