import { type ReactNode, Suspense } from "react";
import { ThemeAccount } from "@/components/app/theme-account";

/**
 * Accepting the terms (doc 02 §6.20): a centred column like the onboarding,
 * without the app's navigation. Outside the (app) group on purpose: its
 * loaders call requireUser(), which would send the person back here in a
 * loop. ThemeAccount brings the account's theme to a new device.
 */
export default function AcceptTermsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:justify-center">
      <div className="flex w-full max-w-[440px] flex-col">{children}</div>
      <Suspense fallback={null}>
        <ThemeAccount />
      </Suspense>
    </main>
  );
}
