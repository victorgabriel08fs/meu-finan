import { type ReactNode, Suspense } from "react";
import { BottomNav, BottomNavView } from "@/components/app/bottom-nav";
import { SideNav, SideNavView } from "@/components/app/side-nav";
import { ThemeAccount } from "@/components/app/theme-account";
import { QuickAddLoader } from "@/components/quick-add/quick-add-loader";
import {
  QuickAddFab,
  QuickAddSidebarButton,
} from "@/components/quick-add/quick-add-trigger";
import { TipsLoader } from "@/components/tips/tips-loader";

/**
 * Signed-in shell (doc 02 §4.2, §4.5): sidebar from lg, tab bar below it.
 * No session read here — every page checks it inside its own <Suspense>, so
 * this shell prerenders. The navs read the pathname, which suspends on
 * dynamic params; their fallbacks are the same navs with nothing selected.
 *
 * Quick add ("Nova transação", §6.5): the "+" triggers only flip a client
 * store, so they work from the first paint; the sheet itself streams in
 * through QuickAddLoader, which checks the session inside its own boundary.
 * ThemeAccount does the same for the account's theme (§6.14).
 * Tips (§6.16) stream in the same way, through TipsLoader.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const sidebarButton = <QuickAddSidebarButton />;
  const fab = <QuickAddFab />;

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-control bg-surface px-4 py-3 text-headline text-primary shadow-card focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>
      <Suspense
        fallback={<SideNavView pathname={null} addButton={sidebarButton} />}
      >
        <SideNav addButton={sidebarButton} />
      </Suspense>
      <main
        id="conteudo"
        tabIndex={-1}
        className="mx-auto w-full max-w-300 min-w-0 flex-1 px-gutter pb-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom)+1.5rem)] outline-none lg:pb-12"
      >
        {children}
      </main>
      <Suspense fallback={<BottomNavView pathname={null} addButton={fab} />}>
        <BottomNav addButton={fab} />
      </Suspense>
      <Suspense fallback={null}>
        <QuickAddLoader />
      </Suspense>
      <Suspense fallback={null}>
        <ThemeAccount />
      </Suspense>
      <Suspense fallback={null}>
        <TipsLoader />
      </Suspense>
    </div>
  );
}
