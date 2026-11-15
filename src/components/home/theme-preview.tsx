"use client";

import { Moon, Sun } from "lucide-react";
import { useDeviceTheme } from "@/components/app/theme-sync";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { isThemeChoice } from "@/lib/theme";

const OPTIONS = [
  { value: "dark", label: "Escuro", icon: <Moon aria-hidden="true" /> },
  { value: "light", label: "Claro", icon: <Sun aria-hidden="true" /> },
];

/**
 * Escuro / Claro for the homepage: changes this device's theme only (no
 * session, so never `choose()`). Nothing is selected until hydration.
 */
export function ThemePreview() {
  const { resolvedTheme, chooseOnDevice } = useDeviceTheme();
  return (
    <div className="@container w-full max-w-72">
      <SegmentedControl
        ariaLabel="Tema"
        options={OPTIONS}
        value={resolvedTheme}
        onValueChange={(value) => {
          if (isThemeChoice(value) && value !== resolvedTheme) {
            chooseOnDevice(value);
          }
        }}
      />
    </div>
  );
}
