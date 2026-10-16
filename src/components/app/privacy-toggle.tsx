"use client";

import { Eye, EyeOff } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { usePrivacyStore } from "@/stores/privacy";

/**
 * Privacy mode switch (doc 02 §2.7, §4.2): hides every amount in the app. The
 * icon follows <html data-privacy> through CSS, so it is right from the first
 * paint; aria-pressed follows the store once it rehydrates.
 */
export function PrivacyToggle({ className }: { className?: string }) {
  const hidden = usePrivacyStore((state) => state.hidden);
  const toggle = usePrivacyStore((state) => state.toggle);

  return (
    <IconButton
      label="Ocultar valores"
      aria-pressed={hidden}
      onClick={toggle}
      className={className}
    >
      <Eye data-privacy-value="" />
      <EyeOff data-privacy-mask="" />
    </IconButton>
  );
}
