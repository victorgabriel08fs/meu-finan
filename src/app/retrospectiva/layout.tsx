import { type ReactNode, Suspense } from "react";
import { ThemeAccount } from "@/components/app/theme-account";
import { QuickAddLoader } from "@/components/quick-add/quick-add-loader";

/**
 * Retrospectiva do mês (doc 02 §6.12): the whole screen, outside the app's
 * navigation, like the onboarding. The page checks the session inside its own
 * <Suspense>; "Guardar a sobra" opens the Nova transação, so the sheet and
 * the account's theme stream in here as they do in the app shell.
 */
export default function RecapLayout({ children }: { children: ReactNode }) {
  return (
    <main className="h-dvh overflow-hidden bg-bg">
      {children}
      <Suspense fallback={null}>
        <QuickAddLoader />
      </Suspense>
      <Suspense fallback={null}>
        <ThemeAccount />
      </Suspense>
    </main>
  );
}
