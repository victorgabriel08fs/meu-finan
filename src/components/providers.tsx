"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider, useTheme } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type CSSProperties, type ReactNode, useEffect } from "react";
import { Toaster } from "sonner";
import { usePrivacyStore } from "@/stores/privacy";

/**
 * App-wide client providers: theme (next-themes on <html data-theme>), URL
 * state (nuqs), motion that honours prefers-reduced-motion, and the toaster.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <NuqsAdapter>
        <MotionConfig reducedMotion="user">
          {children}
          <AppToaster />
          <ThemeColorSync />
          <PrivacyRehydrate />
        </MotionConfig>
      </NuqsAdapter>
    </ThemeProvider>
  );
}

/**
 * Toasts (doc 02 §5.15): bottom centre above the tab bar, full width − 32px on
 * phones, 14px radius, inverted colors (--text background, --surface text) and
 * the action in the other theme's primary. 3s by default; give toasts with an
 * action `duration: 5000` (see toastWithUndo).
 */
function AppToaster() {
  return (
    <Toaster
      position="bottom-center"
      offset={{ bottom: "var(--toast-offset-bottom)" }}
      mobileOffset={{
        bottom: "var(--toast-offset-bottom)",
        left: 16,
        right: 16,
      }}
      gap={8}
      duration={3000}
      containerAriaLabel="Notificações"
      style={
        {
          "--normal-bg": "var(--toast-bg)",
          "--normal-text": "var(--toast-fg)",
          "--normal-border": "transparent",
          "--border-radius": "14px",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans! shadow-dialog! gap-3! px-4! py-3!",
          title: "text-callout! font-semibold!",
          description: "text-caption! text-(--toast-fg)! opacity-80",
          actionButton:
            "h-9! rounded-chip! bg-transparent! px-2! text-callout! font-bold! text-(--toast-action)!",
          cancelButton:
            "h-9! rounded-chip! bg-transparent! px-2! text-callout! font-semibold! text-(--toast-fg)!",
        },
      }}
    />
  );
}

const THEME_COLORS = { light: "#F4F5F7", dark: "#0B0D10" } as const;

/**
 * <meta name="theme-color"> follows the system scheme by default (viewport in
 * the root layout); when the user picks Claro or Escuro, both tags follow the
 * choice so the browser and PWA status bars match the app.
 */
function ThemeColorSync() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    const metas = document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    for (const meta of metas) {
      const scheme =
        theme === "system" || !resolvedTheme
          ? meta.media.includes("dark")
            ? "dark"
            : "light"
          : resolvedTheme === "dark"
            ? "dark"
            : "light";
      meta.content = THEME_COLORS[scheme];
    }
  }, [theme, resolvedTheme]);

  return null;
}

/** Loads the saved privacy choice once mounted (the store skips SSR hydration). */
function PrivacyRehydrate() {
  useEffect(() => {
    void usePrivacyStore.persist.rehydrate();
  }, []);
  return null;
}
