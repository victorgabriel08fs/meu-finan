"use client";

import { useAction } from "next-safe-action/hooks";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  DEFAULT_THEME,
  isThemeChoice,
  type ResolvedTheme,
  shouldAdoptAccountTheme,
  THEME_STORAGE_KEY,
  THEME_SYNCED_KEY,
  type ThemeChoice,
} from "@/lib/theme";
import { setThemeAction } from "@/server/actions/preferences";

/**
 * Client half of the theme preference (doc 02 §6.14). next-themes owns the
 * device's choice (localStorage, <html data-theme> before the first paint);
 * this keeps it in step with the account: a change made here is saved on the
 * account, and the account's theme is adopted when it changed elsewhere.
 */

/** Saves on their way to the server: the account's theme waits for them. */
let pendingSaves = 0;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice lasts until the tab closes.
  }
}

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** The theme on screen right now (the attribute next-themes maintains). */
export function currentResolvedTheme(): ResolvedTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Puts a choice on screen: the attribute at once, inside a short cross-fade
 * where the browser has view transitions and motion is welcome, then
 * next-themes' state and storage (its effect sets the same attribute).
 */
function applyTheme(choice: ThemeChoice, setTheme: (theme: string) => void) {
  const resolved = resolveTheme(choice);
  const update = () => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    setTheme(choice);
  };
  const animate =
    resolved !== currentResolvedTheme() &&
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate) document.startViewTransition(update);
  else update();
}

const subscribeNothing = () => () => {};

/**
 * The device's choice and the theme on screen, both undefined until
 * hydrated: the server cannot know them, so the first render must not
 * depend on them (use CSS on [data-theme] for anything visible before that).
 */
export function useThemeChoice(): {
  theme: ThemeChoice | undefined;
  resolvedTheme: ResolvedTheme | undefined;
} {
  const { theme, resolvedTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!hydrated) return { theme: undefined, resolvedTheme: undefined };
  return {
    theme: isThemeChoice(theme) ? theme : undefined,
    resolvedTheme:
      resolvedTheme === "dark" || resolvedTheme === "light"
        ? resolvedTheme
        : undefined,
  };
}

/**
 * useThemeChoice plus `choose`, which applies a choice on this device and
 * saves it on the account.
 */
export function useThemePreference() {
  const { setTheme } = useTheme();
  const { theme, resolvedTheme } = useThemeChoice();
  const { executeAsync } = useAction(setThemeAction);

  const choose = useCallback(
    (next: ThemeChoice) => {
      const previous = readStorage(THEME_SYNCED_KEY);
      applyTheme(next, setTheme);
      // Marked as the account's value before the server confirms, so the
      // refresh that follows the save is recognised as ours.
      writeStorage(THEME_SYNCED_KEY, next);
      pendingSaves += 1;
      executeAsync({ theme: next })
        .then((result) => {
          if (result?.serverError || result?.validationErrors) {
            throw new Error("not saved");
          }
        })
        .catch(() => {
          writeStorage(THEME_SYNCED_KEY, previous);
          toast(
            "O tema mudou neste aparelho, mas não conseguimos salvá-lo na sua conta.",
            {
              duration: 5000,
              action: { label: "Tentar de novo", onClick: () => choose(next) },
            },
          );
        })
        .finally(() => {
          pendingSaves -= 1;
        });
    },
    [executeAsync, setTheme],
  );

  return { theme, resolvedTheme, choose };
}

/**
 * Adopts the account's theme on this device when it differs from what the
 * device last saw: right after signing in on a new device, or after a change
 * made on another one. Rendered by ThemeAccount, inside <Suspense>.
 */
export function ThemeAccountSync({ saved }: { saved: ThemeChoice }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    if (
      !shouldAdoptAccountTheme({
        saved,
        synced: readStorage(THEME_SYNCED_KEY),
        pending: pendingSaves > 0,
      })
    ) {
      return;
    }
    writeStorage(THEME_SYNCED_KEY, saved);
    const stored = readStorage(THEME_STORAGE_KEY);
    const current = isThemeChoice(stored) ? stored : DEFAULT_THEME;
    if (current !== saved) applyTheme(saved, setTheme);
  }, [saved, setTheme]);

  return null;
}
