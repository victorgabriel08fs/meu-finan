import { type ReactNode, Suspense } from "react";
import { ThemeAccount } from "@/components/app/theme-account";

/**
 * Onboarding (doc 02 §6.2): a centred column like the auth pages, without the
 * app's navigation. The page checks the session inside its own <Suspense>,
 * and ThemeAccount brings the account's theme to a new device.
 */
export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-[440px] flex-1 flex-col">
        {children}
      </div>
      <Suspense fallback={null}>
        <ThemeAccount />
      </Suspense>
    </main>
  );
}
