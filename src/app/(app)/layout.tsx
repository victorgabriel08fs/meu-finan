import { type ReactNode, Suspense } from "react";
import { BottomNav, BottomNavView } from "@/components/app/bottom-nav";
import { SideNav, SideNavView } from "@/components/app/side-nav";

/**
 * Signed-in shell (doc 02 §4.2, §4.5): sidebar from lg, tab bar below it.
 * No session read here — every page checks it inside its own <Suspense>, so
 * this shell prerenders. The navs read the pathname, which suspends on
 * dynamic params; their fallbacks are the same navs with nothing selected.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-control bg-surface px-4 py-3 text-headline text-primary shadow-card focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>
      <Suspense fallback={<SideNavView pathname={null} />}>
        <SideNav />
      </Suspense>
      <main
        id="conteudo"
        tabIndex={-1}
        className="mx-auto w-full max-w-300 min-w-0 flex-1 px-gutter pb-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom)+1.5rem)] outline-none lg:pb-12"
      >
        {children}
      </main>
      <Suspense fallback={<BottomNavView pathname={null} />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
