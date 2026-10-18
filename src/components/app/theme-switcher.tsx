"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui/segmented-control";
import {
  isThemeChoice,
  THEME_CHOICES,
  THEME_LABELS,
  type ThemeChoice,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useThemeChoice, useThemePreference } from "./theme-sync";

const ICONS: Record<ThemeChoice, ReactNode> = {
  dark: <Moon aria-hidden="true" />,
  light: <Sun aria-hidden="true" />,
  system: <Monitor aria-hidden="true" />,
};

const OPTIONS: SegmentedOption[] = THEME_CHOICES.map((choice) => ({
  value: choice,
  label: THEME_LABELS[choice],
  icon: ICONS[choice],
}));

/**
 * Theme preference (doc 02 §6.14): Escuro · Claro · Sistema. Applies at once
 * on this device and is saved on the account. The device's choice is only
 * known in the browser, so nothing is selected during SSR and hydration.
 * `compact` shows the icons only (desktop sidebar); the labeled control drops
 * its icons below 380px, so "Sistema" fits whole on 360px phones.
 */
export function ThemeSwitcher({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { theme, choose } = useThemePreference();

  return (
    <SegmentedControl
      ariaLabel="Tema"
      options={OPTIONS}
      value={theme}
      onValueChange={(value) => {
        if (isThemeChoice(value) && value !== theme) choose(value);
      }}
      iconOnly={compact}
      className={cn(!compact && "max-[23.75rem]:[&_svg]:hidden", className)}
    />
  );
}

/**
 * Name of the device's theme ("Escuro"), for a row that shows the current
 * value. Until hydration it shows `fallback`, the account's theme, which the
 * device follows unless it was changed here.
 */
export function ThemeLabel({ fallback }: { fallback: ThemeChoice }) {
  const { theme } = useThemeChoice();
  return THEME_LABELS[theme ?? fallback];
}
