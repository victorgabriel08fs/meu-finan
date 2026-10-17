"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider, useTheme } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
} from "react";
import { Toaster } from "sonner";
import { DEFAULT_THEME, THEME_COLORS, THEME_STORAGE_KEY } from "@/lib/theme";
import { usePrivacyStore } from "@/stores/privacy";

/**
 * App-wide client providers: theme (next-themes on <html data-theme>, dark
 * by default; see src/lib/theme.ts), URL state (nuqs), motion that honours
 * prefers-reduced-motion, and the toaster.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      storageKey={THEME_STORAGE_KEY}
      defaultTheme={DEFAULT_THEME}
      enableSystem
      disableTransitionOnChange
    >
      <NuqsAdapter>
        <MotionConfig reducedMotion="user">
          {children}
          <AppToaster />
          <ThemeMetaSync />
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

/**
 * <meta name="theme-color"> and <meta name="color-scheme"> start dark (root
 * layout viewport) and THEME_META_SCRIPT points them at the saved theme before
 * the first paint; from then on they follow every change — including
 * "Sistema" when the device switches — so the browser and status bars of the
 * installed app always match the page. Next renders the viewport tags again,
 * with the server's (default) values, on hydration, navigations and
 * refreshes: an observer puts the theme's values back before the next paint.
 */
function ThemeMetaSync() {
  const { resolvedTheme } = useTheme();

  useLayoutEffect(() => {
    const scheme = resolvedTheme === "light" ? "light" : "dark";
    const apply = () => {
      for (const meta of document.querySelectorAll<HTMLMetaElement>(
        'meta[name="theme-color"], meta[name="color-scheme"]',
      )) {
        const content =
          meta.name === "theme-color" ? THEME_COLORS[scheme] : scheme;
        if (meta.content !== content) meta.content = content;
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["content"],
    });
    return () => observer.disconnect();
  }, [resolvedTheme]);

  return null;
}

/** Loads the saved privacy choice once mounted (the store skips SSR hydration). */
function PrivacyRehydrate() {
  useEffect(() => {
    void usePrivacyStore.persist.rehydrate();
  }, []);
  return null;
}
