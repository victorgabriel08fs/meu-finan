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
 * it. The account's theme is adopted only when it differs from this value,
 * i.e. on a new device or after a change made on another one.
 */
export const THEME_SYNCED_KEY = "meu-finan:tema-da-conta";

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
 * value the device last saw or saved (`synced`): a new device has none, and a
 * change made on another device shows up as a different value. Never while a
 * save from this device is on its way, or a stale value from before it would
 * undo the user's choice.
 */
export function shouldAdoptAccountTheme({
  saved,
  synced,
  pending,
}: {
  saved: ThemeChoice;
  synced: string | null;
  pending: boolean;
}): boolean {
  return !pending && synced !== saved;
}

/**
 * Runs before the first paint (inline in the root layout), next to the
 * script next-themes injects for <html data-theme>: points
 * <meta name="theme-color"> and <meta name="color-scheme"> at the saved
 * theme, so the browser and status bars match the page from the start.
 * Keep the resolution in step with next-themes: saved choice or the default,
 * "system" through prefers-color-scheme.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})||${JSON.stringify(DEFAULT_THEME)};if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(t!=="light")t="dark";var c=t==="light"?${JSON.stringify(
  THEME_COLORS.light,
)}:${JSON.stringify(THEME_COLORS.dark)};document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c)});var s=document.querySelector('meta[name="color-scheme"]');if(s)s.setAttribute("content",t)}catch(e){}`;
