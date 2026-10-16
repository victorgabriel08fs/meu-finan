"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui/segmented-control";

const OPTIONS: SegmentedOption[] = [
  { value: "system", label: "Sistema", icon: <Monitor aria-hidden="true" /> },
  { value: "light", label: "Claro", icon: <Sun aria-hidden="true" /> },
  { value: "dark", label: "Escuro", icon: <Moon aria-hidden="true" /> },
];

const subscribeNothing = () => () => {};

/**
 * Theme preference (doc 02 §6.14): Sistema · Claro · Escuro, saved by
 * next-themes on this device. The saved choice is only known in the browser,
 * so nothing is selected during SSR and hydration.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  return (
    <SegmentedControl
      ariaLabel="Tema"
      options={OPTIONS}
      value={hydrated ? (theme ?? "system") : undefined}
      onValueChange={setTheme}
      className={className}
    />
  );
}
