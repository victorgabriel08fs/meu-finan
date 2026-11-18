"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  type ComponentType,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { type EntryKind, useQuickAddStore } from "@/stores/quick-add";
import { loadQuickAddForm, preloadQuickAddForm } from "./preload";
import { TEXT_FIELDS } from "./text-fields";
import type { QuickAddSheetData } from "./types";

/** The form, in a chunk of its own: not part of every page's first load. */
const QuickAddContent = lazy(
  (): Promise<{ default: ComponentType<{ data: QuickAddSheetData }> }> =>
    loadQuickAddForm().then(
      (mod) => ({ default: mod.QuickAddContent }),
      // Offline or a deploy in between: a tap explains instead of breaking.
      () => ({ default: QuickAddUnavailable }),
    ),
);

const NOVO_PARAM: Record<string, EntryKind | undefined> = {
  despesa: "expense",
  receita: "income",
  transferencia: "transfer",
};

/** Desktop shortcuts (doc 02 §4.5): N nova despesa, R receita, T transferência. */
const SHORTCUTS: Record<string, EntryKind> = {
  n: "expense",
  r: "income",
  t: "transfer",
};

/**
 * Whether to mount the form: once its code was fetched while the page was
 * idle (or after a second without idle callbacks). Opening the sheet mounts
 * it sooner, with a placeholder until the code arrives.
 */
function useFormFetched(): boolean {
  const [fetched, setFetched] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      void preloadQuickAddForm().then(() => {
        if (!cancelled) setFetched(true);
      });
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = setTimeout(run, 1000);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, []);
  return fetched;
}

/**
 * What the sheet shows while the form's code is still on its way (a tap on
 * "+" right after the page opened, on a slow network): the sheet with its
 * title and size, until the form takes over.
 */
function QuickAddFormPlaceholder() {
  return (
    <SheetContent
      title="Nova transação"
      fullHeight
      className="h-[calc(var(--sheet-vvh,100dvh)-max(2rem,env(safe-area-inset-top)+0.5rem))] max-h-none md:h-[min(92dvh,54rem)] md:max-w-120"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const target = useQuickAddStore.getState().returnFocus;
        if (target?.isConnected) target.focus({ preventScroll: true });
      }}
    >
      <LoadingRegion className="flex flex-col gap-4">
        <Skeleton className="h-11" />
        <Skeleton className="h-16" />
        <Skeleton className="h-11" />
        <Skeleton className="h-24" />
      </LoadingRegion>
    </SheetContent>
  );
}

/**
 * The global "Nova transação" sheet (doc 02 §6.5). Mounted once by the app
 * layout when its data has loaded; opened from any "+" through the
 * quick-add store, which also keeps the draft between openings. The form
 * itself comes in a chunk of its own (quick-add-form.tsx), fetched when the
 * page is idle or when a trigger is touched.
 */
export function QuickAddSheet({ data }: { data: QuickAddSheetData }) {
  const open = useQuickAddStore((state) => state.open);
  const openQuickAdd = useQuickAddStore((state) => state.openQuickAdd);
  const closeQuickAdd = useQuickAddStore((state) => state.closeQuickAdd);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const requested = NOVO_PARAM[useSearchParams().get("novo") ?? ""];
  const fetched = useFormFetched();

  useEffect(() => {
    useQuickAddStore.getState().loadPreferences();
  }, []);

  // The sheet lives in the layout, so a navigation from inside it ("Criar
  // conta") would leave it open over the new page. Closing once the URL has
  // changed also keeps useBackToClose from stepping back over the navigation.
  // (Declared before the `?novo=` effect: a navigation to `?novo=` reopens.)
  useEffect(() => {
    if (pathname === pathnameRef.current) return;
    pathnameRef.current = pathname;
    const store = useQuickAddStore.getState();
    if (store.open) store.closeQuickAdd();
  }, [pathname]);

  // `?novo=despesa|receita|transferencia` on any route opens the sheet (doc
  // 02 §4.1; the manifest shortcuts use it). The parameter is dropped right
  // away, so reloading the page does not open the sheet again.
  useEffect(() => {
    if (!requested) return;
    openQuickAdd(requested);
    const url = new URL(window.location.href);
    url.searchParams.delete("novo");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [requested, openQuickAdd]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        useQuickAddStore.getState().open
      ) {
        return;
      }
      const kind = SHORTCUTS[event.key.toLowerCase()];
      if (!kind) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TEXT_FIELDS)) return;
      // A tip balloon is a dialog too, but N while it shows is the tip's point.
      if (document.querySelector("[role='dialog']:not([data-coach-mark] *)"))
        return;
      event.preventDefault();
      openQuickAdd(kind);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openQuickAdd]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeQuickAdd();
      }}
    >
      {fetched || open ? (
        <Suspense fallback={<QuickAddFormPlaceholder />}>
          <QuickAddContent data={data} />
        </Suspense>
      ) : null}
    </Sheet>
  );
}

/** Stand-in when the sheet's data failed to load: a tap explains instead of doing nothing. */
export function QuickAddUnavailable() {
  const open = useQuickAddStore((state) => state.open);
  useEffect(() => {
    if (!open) return;
    toast.error("Não deu para abrir o formulário agora. Recarregue a página.");
    useQuickAddStore.getState().closeQuickAdd();
  }, [open]);
  return null;
}
