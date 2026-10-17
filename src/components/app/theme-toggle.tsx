"use client";

import { Moon, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { currentResolvedTheme, useThemePreference } from "./theme-sync";

/**
 * Quick dark/light switch (doc 02 §4.2, next to the privacy eye): the icon
 * shows the theme on screen and follows <html data-theme> through CSS, so it
 * is right from the first paint; aria-pressed follows once hydrated. From
 * "Sistema" it switches to the opposite of what is on screen; the full choice
 * stays in Ajustes › Preferências.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, choose } = useThemePreference();

  return (
    <IconButton
      label="Tema escuro"
      aria-pressed={resolvedTheme ? resolvedTheme === "dark" : undefined}
      onClick={() =>
        choose(currentResolvedTheme() === "dark" ? "light" : "dark")
      }
      className={className}
    >
      <Moon className="hidden dark:block" />
      <Sun className="dark:hidden" />
    </IconButton>
  );
}
